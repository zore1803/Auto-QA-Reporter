import { chromium } from 'playwright';
import type { FormIssue } from './types.js';
import { playwrightEnv } from './playwright-env.js';

const SQL_INJECTION_STRINGS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "1; SELECT * FROM users",
];

const XSS_STRINGS = [
  '<script>alert("xss")</script>',
  '"><script>alert(1)</script>',
];

export async function testForms(pages: Array<{ url: string }>): Promise<FormIssue[]> {
  const issues: FormIssue[] = [];

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      env: playwrightEnv(),
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });

    const pagePromises = pages.map(async ({ url }) => {
      const pageIssues: FormIssue[] = [];
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const formData = await page.evaluate(() => {
          // Robust absolute CSS path generator
          const getCssPath = (el: Element | null): string => {
            if (!el || !(el instanceof Element)) return '';
            const path: string[] = [];
            let current: Element | null = el;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.nodeName.toLowerCase();
              if (current.id) {
                selector += '#' + current.id.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1');
                path.unshift(selector);
                break;
              } else {
                let sib = current.previousElementSibling;
                let nth = 1;
                while (sib) {
                  if (sib.nodeName.toLowerCase() === selector) nth++;
                  sib = sib.previousElementSibling;
                }
                if (nth !== 1) selector += `:nth-of-type(${nth})`;
                else {
                  let nextSib = current.nextElementSibling;
                  let hasMore = false;
                  while (nextSib) {
                    if (nextSib.nodeName.toLowerCase() === selector) { hasMore = true; break; }
                    nextSib = nextSib.nextElementSibling;
                  }
                  if (hasMore) selector += `:nth-of-type(1)`;
                }
              }
              path.unshift(selector);
              current = current.parentElement;
            }
            return path.join(' > ');
          };

          const forms = document.querySelectorAll('form');
          return Array.from(forms).map((form, i) => {
            const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map((el) => ({
              type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
              name: (el as HTMLInputElement).name || '',
              required: (el as HTMLInputElement).required || false,
              id: el.id || '',
            }));
            const hasRequiredFields = inputs.some((inp) => inp.required);
            const hasEmailField = inputs.some((inp) => inp.type === 'email');
            const hasPasswordField = inputs.some((inp) => inp.type === 'password');
            const textInputs = inputs.filter((inp) =>
              ['text', 'textarea', 'search', 'url'].includes(inp.type)
            );
            return {
              index: i,
              selector: getCssPath(form),
              inputCount: inputs.length,
              hasRequiredFields,
              hasEmailField,
              hasPasswordField,
              textInputSelectors: textInputs
                .map((inp) => getCssPath(inp))
                .filter(Boolean),
              action: form.action || '',
              method: form.method || 'get',
            };
          });
        });

        // Test all forms on this page concurrently
        const formPromises = formData.map(async (form) => {
          const localIssues: FormIssue[] = [];
          const formSelector = form.selector;

          if (form.inputCount === 0) {
            localIssues.push({
              page: url,
              formSelector,
              issueType: 'Empty Form',
              description: `Form "${formSelector}" contains no input elements at all.`,
              impact:
                'A form with no inputs serves no purpose and may indicate a rendering error or missing markup. Users who interact with it will be confused or unable to complete the intended action.',
              recommendation:
                'Add the appropriate input fields, or remove the <form> element if it is no longer needed. Verify the page renders correctly in all target browsers.',
              severity: 'Low',
            });
            return localIssues;
          }

          // Test 1: Empty form submission
          const emptyPage = await context.newPage();
          try {
            await emptyPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            const formEl = await emptyPage.$(formSelector);
            if (formEl) {
               await formEl.evaluate((f: HTMLFormElement) => {
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                f.dispatchEvent(submitEvent);
              });
              await emptyPage.waitForTimeout(500);

              const hasValidationMessage = await emptyPage.evaluate((sel) => {
                const f = document.querySelector(sel);
                if (!f) return false;
                const inputs = f.querySelectorAll('input:required, textarea:required');
                let hasMsg = false;
                inputs.forEach((input) => {
                  if ((input as HTMLInputElement).validationMessage) hasMsg = true;
                });
                return hasMsg;
              }, formSelector);

              if (form.hasRequiredFields && !hasValidationMessage) {
                localIssues.push({
                  page: url,
                  formSelector,
                  issueType: 'Missing Validation on Empty Submit',
                  description: `Form "${formSelector}" has required fields but does not display browser-native or custom validation messages when submitted empty.`,
                  impact:
                    'Users who submit the form without filling required fields receive no feedback.',
                  recommendation:
                    'Add the required attribute to mandatory inputs so browsers show built-in validation messages.',
                  severity: 'Medium',
                });
              }
            }
          } catch {
            // skip
          } finally {
            await emptyPage.close();
          }

          // Test 2: No required fields marked
          if (!form.hasRequiredFields && form.inputCount > 1) {
            localIssues.push({
              page: url,
              formSelector,
              issueType: 'No Required Fields Marked',
              description: `Form "${formSelector}" has ${form.inputCount} input fields but none are marked as required.`,
              impact: 'Users have no visual indication of which fields must be filled.',
              recommendation: 'Add the required attribute to all mandatory inputs.',
              severity: 'Low',
            });
          }

          // Test 3: SQL injection in text inputs
          if (form.textInputSelectors.length > 0) {
            const sqlPage = await context.newPage();
            try {
              await sqlPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
              const testSelector = form.textInputSelectors[0] as string;
              const input = await sqlPage.$(testSelector);
              if (input) {
                await input.fill(SQL_INJECTION_STRINGS[0]);
                const value = await input.inputValue();
                if (value === SQL_INJECTION_STRINGS[0]) {
                  localIssues.push({
                    page: url,
                    formSelector,
                    issueType: 'No Input Sanitization (SQL Injection)',
                    description: `Text input "${testSelector}" in form "${formSelector}" accepted the SQL injection string "${SQL_INJECTION_STRINGS[0]}" without any client-side sanitization.`,
                    impact: 'SQL injection is consistently ranked #1 in the OWASP Top 10 web vulnerabilities.',
                    recommendation: 'Validate and reject obviously malicious patterns on the client side.',
                    severity: 'High',
                  });
                }
                
                await input.fill(XSS_STRINGS[0]);
                const xssValue = await input.inputValue();
                if (xssValue === XSS_STRINGS[0]) {
                  localIssues.push({
                    page: url,
                    formSelector,
                    issueType: 'No Input Sanitization (XSS)',
                    description: `Text input "${testSelector}" in form "${formSelector}" accepted a cross-site scripting (XSS) payload.`,
                    impact: 'An attacker can inject scripts that steal session cookies.',
                    recommendation: 'Escape all user-supplied content before rendering it as HTML.',
                    severity: 'High',
                  });
                }
              }
            } catch {
            } finally {
              await sqlPage.close();
            }
          }

          // Test 4: Email validation
          if (form.hasEmailField) {
            const emailPage = await context.newPage();
            try {
              await emailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
              const emailInput = await emailPage.$(`${formSelector} input[type="email"]`);
              if (emailInput) {
                await emailInput.fill('notanemail');
                await emailInput.evaluate((el: HTMLInputElement) =>
                  el.dispatchEvent(new Event('change', { bubbles: true }))
                );
                await emailPage.waitForTimeout(300);
                const isInvalid = await emailInput.evaluate(
                  (el: HTMLInputElement) => !el.validity.valid
                );
                if (!isInvalid) {
                  localIssues.push({
                    page: url,
                    formSelector,
                    issueType: 'Weak Email Validation',
                    description: `The email input in form "${formSelector}" accepted "notanemail" without showing a validation error.`,
                    impact: 'Accepting invalid email addresses results in undeliverable confirmation emails.',
                    recommendation: 'Use <input type="email"> (which enables built-in browser validation).',
                    severity: 'Medium',
                  });
                }
              }
            } catch {
            } finally {
              await emailPage.close();
            }
          }

          // Test 5: Password field security
          if (form.hasPasswordField) {
            const pwPage = await context.newPage();
            try {
              await pwPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
              const pwInput = await pwPage.$(`${formSelector} input[type="password"]`);
              if (pwInput) {
                await pwInput.fill('123');
                const minLength = await pwInput.evaluate((el: HTMLInputElement) => el.minLength);
                if (minLength <= 0) {
                  localIssues.push({
                    page: url,
                    formSelector,
                    issueType: 'Weak Password Policy',
                    description: `The password field in form "${formSelector}" has no minlength attribute and accepted the trivially weak password "123".`,
                    impact: 'Allowing short or simple passwords makes accounts trivially susceptible to brute-force attacks.',
                    recommendation: 'Enforce a minimum password length of at least 8 characters using the minlength attribute.',
                    severity: 'High',
                  });
                }
              }
            } catch {
            } finally {
              await pwPage.close();
            }
          }

          return localIssues;
        });

        const formResults = await Promise.all(formPromises);
        for (const res of formResults) pageIssues.push(...res);
        return pageIssues;

      } catch {
        // Skip failed pages
        return [];
      } finally {
        await page.close();
      }
    });

    const results = await Promise.all(pagePromises);
    for (const res of results) issues.push(...res);

    await context.close();
  } finally {
    if (browser) await browser.close();
  }

  return issues;
}
