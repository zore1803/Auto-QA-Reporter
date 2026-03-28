import type { Page, Locator } from 'playwright';

export interface LocatorFallbacks {
  text?: string;
  label?: string;
  placeholder?: string;
  role?: string;
  name?: string;
}

/**
 * Try the primary CSS/XPath selector first, then fall back through
 * text-, label-, placeholder-, and role-based strategies.
 * Returns the first matching Locator, or null if none found.
 */
export async function resolveLocator(
  page: Page,
  primarySelector: string,
  fallbacks: LocatorFallbacks = {}
): Promise<Locator | null> {
  // 1. Primary CSS selector
  try {
    const loc = page.locator(primarySelector);
    if ((await loc.count()) > 0) return loc.first();
  } catch {
    // invalid selector – continue
  }

  // 2. By visible text
  if (fallbacks.text) {
    try {
      const loc = page.getByText(fallbacks.text, { exact: false });
      if ((await loc.count()) > 0) return loc.first();
    } catch {}
  }

  // 3. By label (form inputs)
  if (fallbacks.label) {
    try {
      const loc = page.getByLabel(fallbacks.label, { exact: false });
      if ((await loc.count()) > 0) return loc.first();
    } catch {}
  }

  // 4. By placeholder
  if (fallbacks.placeholder) {
    try {
      const loc = page.getByPlaceholder(fallbacks.placeholder, { exact: false });
      if ((await loc.count()) > 0) return loc.first();
    } catch {}
  }

  // 5. By ARIA role
  if (fallbacks.role) {
    try {
      const loc = page.getByRole(fallbacks.role as Parameters<Page['getByRole']>[0], {
        name: fallbacks.name,
      });
      if ((await loc.count()) > 0) return loc.first();
    } catch {}
  }

  return null;
}

/**
 * Locate a submit button using multiple strategies.
 */
export async function resolveSubmitButton(page: Page, formSelector: string): Promise<Locator | null> {
  const strategies = [
    `${formSelector} [type="submit"]`,
    `${formSelector} button`,
    `${formSelector} input[type="button"]`,
  ];
  for (const sel of strategies) {
    try {
      const loc = page.locator(sel);
      if ((await loc.count()) > 0) return loc.first();
    } catch {}
  }
  // Role fallback
  try {
    const loc = page.getByRole('button', { name: /submit|send|sign.?in|log.?in|register|search/i });
    if ((await loc.count()) > 0) return loc.first();
  } catch {}
  return null;
}

/**
 * Locate an input field by trying CSS selector, then label/placeholder fallbacks.
 */
export async function resolveInputField(
  page: Page,
  primarySelector: string,
  fieldHint?: string
): Promise<Locator | null> {
  return resolveLocator(page, primarySelector, {
    label: fieldHint,
    placeholder: fieldHint,
  });
}
