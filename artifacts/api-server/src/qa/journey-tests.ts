import { chromium } from 'playwright';
import type { JourneyIssue, JourneyResult, Severity } from './types.js';
import { playwrightEnv } from './playwright-env.js';
import { resolveLocator, resolveSubmitButton } from './locator-resolver.js';

// ─── Journey detection helpers ──────────────────────────────────────────────

interface DetectedJourney {
  type: 'login' | 'signup' | 'search' | 'checkout' | 'contact';
  formSelector: string;
  signals: string[];
}

async function detectJourneys(url: string): Promise<DetectedJourney[]> {
  const { chromium: c } = await import('playwright');
  let browser = null;
  const detected: DetectedJourney[] = [];

  try {
    browser = await c.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const forms = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('form')).map((form, i) => {
        const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map((el) => ({
          type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
          name: ((el as HTMLInputElement).name || el.getAttribute('placeholder') || '').toLowerCase(),
          id: el.id.toLowerCase(),
        }));
        const submitText = (form.querySelector('[type="submit"], button')?.textContent || '').toLowerCase();
        const formId = form.id.toLowerCase();
        const formAction = form.action?.toLowerCase() || '';
        return {
          index: i,
          selector: form.id ? `#${form.id}` : `form:nth-of-type(${i + 1})`,
          inputs,
          submitText,
          formId,
          formAction,
        };
      });
    });

    for (const form of forms) {
      const inputTypes = form.inputs.map((i) => i.type);
      const inputNames = form.inputs.map((i) => i.name + ' ' + i.id).join(' ');

      const hasPassword = inputTypes.includes('password');
      const hasEmail = inputTypes.includes('email') || inputNames.includes('email');
      const hasSearch = inputTypes.includes('search') || inputNames.includes('search') || inputNames.includes('query') || inputNames.includes('q');
      const hasTextarea = inputTypes.includes('textarea');
      const multiplePasswords = inputTypes.filter((t) => t === 'password').length > 1;
      const hasName = inputNames.includes('name') || inputNames.includes('first');

      const signals: string[] = [];

      if (hasPassword && hasEmail) {
        if (multiplePasswords || hasName || /sign.?up|register|creat/i.test(form.submitText + form.formId + form.formAction)) {
          signals.push('password', 'email', hasName ? 'name' : '', multiplePasswords ? 'confirmPassword' : '');
          detected.push({ type: 'signup', formSelector: form.selector, signals });
        } else {
          signals.push('password', 'email');
          detected.push({ type: 'login', formSelector: form.selector, signals });
        }
      } else if (hasSearch) {
        signals.push('search');
        detected.push({ type: 'search', formSelector: form.selector, signals });
      } else if (/checkout|payment|billing|cart|order/i.test(form.submitText + form.formId + form.formAction)) {
        signals.push('checkout');
        detected.push({ type: 'checkout', formSelector: form.selector, signals });
      } else if (hasEmail && hasTextarea) {
        signals.push('email', 'textarea');
        detected.push({ type: 'contact', formSelector: form.selector, signals });
      } else if (hasEmail && hasName) {
        signals.push('email', 'name');
        detected.push({ type: 'contact', formSelector: form.selector, signals });
      }
    }

    await page.close();
    await context.close();
  } catch {
    // Detection failed — return whatever we found
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }

  return detected;
}

// ─── Journey test runners ────────────────────────────────────────────────────

async function testLoginJourney(
  url: string,
  formSelector: string
): Promise<JourneyResult> {
  const issues: JourneyIssue[] = [];
  const stepsCompleted: string[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsCompleted.push('Navigate to page');

    // Check form exists
    const form = await resolveLocator(page, formSelector, { role: 'form' });
    if (!form) {
      issues.push({
        journeyType: 'login',
        page: url,
        severity: 'High',
        issueType: 'Login Form Not Found',
        description: `Could not locate the login form using selector "${formSelector}" or role-based fallbacks.`,
        step: 'Locate form',
        recommendation: 'Ensure the form has a stable id, aria role, or is reachable without JavaScript redirects.',
        selector: formSelector,
      });
      return { journeyType: 'login', page: url, stepsCompleted, issues };
    }
    stepsCompleted.push('Locate login form');

    // Try empty submit
    const submitBtn = await resolveSubmitButton(page, formSelector);
    if (submitBtn) {
      await submitBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      stepsCompleted.push('Submit empty form');

      // Check for validation feedback
      const hasValidation = await page.evaluate((sel) => {
        const form = document.querySelector(sel);
        if (!form) return false;
        const inputs = form.querySelectorAll('input:required');
        let hasFeedback = false;
        inputs.forEach((inp) => {
          if ((inp as HTMLInputElement).validationMessage) hasFeedback = true;
        });
        // Also check for visible error messages
        const errEls = document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]');
        if (errEls.length > 0) hasFeedback = true;
        return hasFeedback;
      }, formSelector).catch(() => false);

      if (!hasValidation) {
        issues.push({
          journeyType: 'login',
          page: url,
          severity: 'Medium',
          issueType: 'Login: No Empty-Submit Validation',
          description: 'Submitting the login form empty shows no validation message or error feedback.',
          step: 'Submit empty form',
          recommendation: 'Display clear inline error messages when required fields (email/username, password) are left empty.',
          selector: formSelector,
        });
      }
    }

    // Fill with test credentials
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    const emailInput = await resolveLocator(page, `${formSelector} input[type="email"]`, {
      label: 'email',
      placeholder: 'email',
    });
    const textInput = await resolveLocator(page, `${formSelector} input[type="text"]`, {
      label: 'username',
      placeholder: 'username',
    });
    const passwordInput = await resolveLocator(page, `${formSelector} input[type="password"]`, {
      label: 'password',
      placeholder: 'password',
    });

    if ((emailInput || textInput) && passwordInput) {
      stepsCompleted.push('Fill credentials');
      if (emailInput) await emailInput.fill('test@example.com').catch(() => {});
      if (textInput && !emailInput) await textInput.fill('testuser').catch(() => {});
      await passwordInput.fill('TestPass123!').catch(() => {});
    } else {
      issues.push({
        journeyType: 'login',
        page: url,
        severity: 'Medium',
        issueType: 'Login: Fields Hard to Locate',
        description: 'Could not reliably locate the email/username or password fields using standard selectors and fallbacks.',
        step: 'Fill credentials',
        recommendation: 'Add clear id or name attributes to the email and password inputs.',
        selector: formSelector,
      });
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      journeyType: 'login',
      page: url,
      severity: 'High',
      issueType: 'Login Journey Error',
      description: `An error stopped the login journey: ${msg.substring(0, 150)}`,
      step: 'Journey execution',
      recommendation: 'Check for JavaScript errors, redirects, or authentication walls blocking automated access.',
    });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }

  return { journeyType: 'login', page: url, stepsCompleted, issues };
}

async function testSignupJourney(
  url: string,
  formSelector: string
): Promise<JourneyResult> {
  const issues: JourneyIssue[] = [];
  const stepsCompleted: string[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsCompleted.push('Navigate to page');

    const form = await resolveLocator(page, formSelector, { role: 'form' });
    if (!form) {
      issues.push({
        journeyType: 'signup',
        page: url,
        severity: 'High',
        issueType: 'Signup Form Not Found',
        description: `Could not locate the signup form using selector "${formSelector}".`,
        step: 'Locate form',
        recommendation: 'Ensure the signup form has stable selectors.',
        selector: formSelector,
      });
      return { journeyType: 'signup', page: url, stepsCompleted, issues };
    }
    stepsCompleted.push('Locate signup form');

    // Check password strength enforcement
    const pwInput = await resolveLocator(page, `${formSelector} input[type="password"]`, {
      label: 'password',
      placeholder: 'password',
    });

    if (pwInput) {
      stepsCompleted.push('Test password strength');
      await pwInput.fill('123').catch(() => {});
      const minLen = await pwInput.evaluate((el: HTMLInputElement) => el.minLength).catch(() => -1);
      const pattern = await pwInput.evaluate((el: HTMLInputElement) => el.pattern).catch(() => '');

      if (minLen <= 0 && !pattern) {
        issues.push({
          journeyType: 'signup',
          page: url,
          severity: 'High',
          issueType: 'Signup: Weak Password Policy',
          description: 'The password field accepts very short passwords (e.g. "123") with no minlength or pattern constraint.',
          step: 'Test password strength',
          recommendation: 'Enforce at least 8 characters via the minlength attribute and server-side validation.',
          selector: `${formSelector} input[type="password"]`,
        });
      }
    }

    // Check email field
    const emailInput = await resolveLocator(page, `${formSelector} input[type="email"]`, {
      label: 'email',
      placeholder: 'email',
    });
    if (emailInput) {
      stepsCompleted.push('Test email validation');
      await emailInput.fill('notanemail').catch(() => {});
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid).catch(() => false);
      if (!isInvalid) {
        issues.push({
          journeyType: 'signup',
          page: url,
          severity: 'Medium',
          issueType: 'Signup: Weak Email Validation',
          description: 'The email field accepted "notanemail" without flagging it as invalid.',
          step: 'Test email validation',
          recommendation: 'Use <input type="email"> so the browser enforces format validation.',
          selector: `${formSelector} input[type="email"]`,
        });
      }
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      journeyType: 'signup',
      page: url,
      severity: 'High',
      issueType: 'Signup Journey Error',
      description: `An error stopped the signup journey: ${msg.substring(0, 150)}`,
      step: 'Journey execution',
      recommendation: 'Inspect the page for JavaScript errors or auth walls.',
    });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }

  return { journeyType: 'signup', page: url, stepsCompleted, issues };
}

async function testSearchJourney(
  url: string,
  formSelector: string
): Promise<JourneyResult> {
  const issues: JourneyIssue[] = [];
  const stepsCompleted: string[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsCompleted.push('Navigate to page');

    const searchInput = await resolveLocator(
      page,
      `${formSelector} input[type="search"], ${formSelector} input[name="q"], ${formSelector} input[name="query"], ${formSelector} input[name="search"]`,
      { role: 'searchbox', placeholder: 'search' }
    );

    if (!searchInput) {
      issues.push({
        journeyType: 'search',
        page: url,
        severity: 'Medium',
        issueType: 'Search: Input Not Found',
        description: 'Could not locate the search input field using standard selectors.',
        step: 'Locate search input',
        recommendation: 'Use <input type="search"> or add name="q" / role="searchbox" to the search input.',
        selector: formSelector,
      });
      return { journeyType: 'search', page: url, stepsCompleted, issues };
    }
    stepsCompleted.push('Locate search input');

    // Type a query
    await searchInput.fill('test search query').catch(() => {});
    stepsCompleted.push('Enter search query');

    // Submit via Enter key
    await searchInput.press('Enter').catch(() => {});
    await page.waitForTimeout(1500);
    stepsCompleted.push('Submit search');

    // Check if URL changed or results appeared
    const currentUrl = page.url();
    const hasResults = await page.evaluate(() => {
      const resultIndicators = document.querySelectorAll(
        '[class*="result"], [class*="search"], [role="listbox"], [aria-label*="result"]'
      );
      return resultIndicators.length > 0;
    }).catch(() => false);

    if (!hasResults && currentUrl === url) {
      issues.push({
        journeyType: 'search',
        page: url,
        severity: 'Medium',
        issueType: 'Search: No Visible Results or Navigation',
        description: 'After submitting a search query, neither results appeared nor did the URL change.',
        step: 'Verify search results',
        recommendation: 'Ensure the search form submits to a results page or dynamically shows results in the page.',
        selector: formSelector,
      });
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      journeyType: 'search',
      page: url,
      severity: 'Medium',
      issueType: 'Search Journey Error',
      description: `An error stopped the search journey: ${msg.substring(0, 150)}`,
      step: 'Journey execution',
      recommendation: 'Check for JavaScript errors on the page.',
    });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }

  return { journeyType: 'search', page: url, stepsCompleted, issues };
}

async function testContactJourney(
  url: string,
  formSelector: string
): Promise<JourneyResult> {
  const issues: JourneyIssue[] = [];
  const stepsCompleted: string[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsCompleted.push('Navigate to page');

    const form = await resolveLocator(page, formSelector, { role: 'form' });
    if (!form) {
      issues.push({
        journeyType: 'contact',
        page: url,
        severity: 'Medium',
        issueType: 'Contact Form Not Found',
        description: `Could not locate the contact form using selector "${formSelector}".`,
        step: 'Locate form',
        recommendation: 'Ensure the contact form is reachable without login.',
        selector: formSelector,
      });
      return { journeyType: 'contact', page: url, stepsCompleted, issues };
    }
    stepsCompleted.push('Locate contact form');

    // Empty submit
    const submitBtn = await resolveSubmitButton(page, formSelector);
    if (submitBtn) {
      await submitBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      stepsCompleted.push('Submit empty form');

      const hasError = await page.evaluate(() => {
        return document.querySelectorAll(
          '[class*="error"], [role="alert"], [class*="invalid"], input:invalid'
        ).length > 0;
      }).catch(() => false);

      if (!hasError) {
        issues.push({
          journeyType: 'contact',
          page: url,
          severity: 'Medium',
          issueType: 'Contact: No Empty-Submit Feedback',
          description: 'Submitting the contact form empty shows no validation error or feedback message.',
          step: 'Submit empty form',
          recommendation: 'Show inline error messages when required fields are empty.',
          selector: formSelector,
        });
      }
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      journeyType: 'contact',
      page: url,
      severity: 'Low',
      issueType: 'Contact Journey Error',
      description: `An error stopped the contact journey: ${msg.substring(0, 150)}`,
      step: 'Journey execution',
      recommendation: 'Check for JavaScript errors or redirects.',
    });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }

  return { journeyType: 'contact', page: url, stepsCompleted, issues };
}

async function testCheckoutJourney(
  url: string,
  formSelector: string
): Promise<JourneyResult> {
  const issues: JourneyIssue[] = [];
  const stepsCompleted: string[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsCompleted.push('Navigate to page');

    // Check for add-to-cart or checkout buttons
    const cartButton = await resolveLocator(
      page,
      '[class*="cart"], [class*="checkout"], [href*="cart"], [href*="checkout"]',
      { role: 'button', text: 'Add to cart' }
    );

    if (!cartButton) {
      issues.push({
        journeyType: 'checkout',
        page: url,
        severity: 'Low',
        issueType: 'Checkout: Cart Entry Not Found',
        description: 'Could not find a cart or checkout button on this page.',
        step: 'Find cart entry point',
        recommendation: 'Ensure cart/checkout buttons are clearly labelled and reachable without login.',
        selector: formSelector,
      });
    } else {
      stepsCompleted.push('Found cart entry point');
    }

    // Check for payment form fields
    const hasPaymentFields = await page.evaluate(() => {
      const cardInputs = document.querySelectorAll(
        'input[name*="card"], input[autocomplete*="cc-"], [placeholder*="card"], iframe[src*="stripe"], iframe[src*="paypal"]'
      );
      return cardInputs.length > 0;
    }).catch(() => false);

    if (hasPaymentFields) {
      stepsCompleted.push('Found payment fields');
    } else {
      issues.push({
        journeyType: 'checkout',
        page: url,
        severity: 'Low',
        issueType: 'Checkout: Payment Fields Not Detected',
        description: 'No payment form fields were found on the checkout page.',
        step: 'Verify payment form',
        recommendation: 'Ensure payment fields are visible and accessible on the checkout page.',
        selector: formSelector,
      });
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      journeyType: 'checkout',
      page: url,
      severity: 'Low',
      issueType: 'Checkout Journey Error',
      description: `An error stopped the checkout journey: ${msg.substring(0, 150)}`,
      step: 'Journey execution',
      recommendation: 'Check if the checkout page requires login or a specific state.',
    });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }

  return { journeyType: 'checkout', page: url, stepsCompleted, issues };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Detect and test all user journeys found on the given pages.
 * Returns results per journey and a flat list of all issues found.
 */
export async function runJourneyTests(
  pages: Array<{ url: string }>
): Promise<{ results: JourneyResult[]; issues: JourneyIssue[] }> {
  const allResults: JourneyResult[] = [];

  for (const { url } of pages.slice(0, 5)) {
    let detected: DetectedJourney[] = [];
    try {
      detected = await detectJourneys(url);
    } catch {
      continue;
    }

    for (const journey of detected) {
      let result: JourneyResult;
      switch (journey.type) {
        case 'login':
          result = await testLoginJourney(url, journey.formSelector);
          break;
        case 'signup':
          result = await testSignupJourney(url, journey.formSelector);
          break;
        case 'search':
          result = await testSearchJourney(url, journey.formSelector);
          break;
        case 'contact':
          result = await testContactJourney(url, journey.formSelector);
          break;
        case 'checkout':
          result = await testCheckoutJourney(url, journey.formSelector);
          break;
        default:
          continue;
      }
      allResults.push(result);
    }
  }

  const allIssues = allResults.flatMap((r) => r.issues);
  return { results: allResults, issues: allIssues };
}
