const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
export const toHistorySafeState = (value) => {
  const seen = new WeakSet();

  const sanitize = (input) => {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'function' || typeof input === 'symbol') {
      return undefined;
    }

    if (typeof input === 'bigint') {
      return String(input);
    }

    if (input instanceof Date) {
      return input.toISOString();
    }

    if (input instanceof RegExp) {
      return String(input);
    }

    if (input instanceof Error) {
      return {
        name: input.name,
        message: input.message,
      };
    }

    if (Array.isArray(input)) {
      return input
        .map((item) => sanitize(item))
        .filter((item) => item !== undefined);
    }

    if (input && typeof input === 'object') {
      if (seen.has(input)) {
        return undefined;
      }

      if (!isPlainObject(input)) {
        if (input instanceof Map) {
          seen.add(input);
          return Array.from(input.entries())
            .map(([key, value]) => [sanitize(key), sanitize(value)])
            .filter(([key, value]) => key !== undefined && value !== undefined);
        }

        if (input instanceof Set) {
          seen.add(input);
          return Array.from(input.values())
            .map((item) => sanitize(item))
            .filter((item) => item !== undefined);
        }

        if (
          input instanceof Blob
          || (typeof File !== 'undefined' && input instanceof File)
          || input instanceof ArrayBuffer
        ) {
          return input;
        }

        const enumerableEntries = Object.entries(input);
        if (!enumerableEntries.length) {
          return String(input);
        }

        seen.add(input);

        return enumerableEntries.reduce((accumulator, [key, item]) => {
          const sanitizedValue = sanitize(item);

          if (sanitizedValue !== undefined) {
            accumulator[key] = sanitizedValue;
          }

          return accumulator;
        }, {});
      }

      seen.add(input);

      return Object.entries(input).reduce((accumulator, [key, item]) => {
        const sanitizedValue = sanitize(item);

        if (sanitizedValue !== undefined) {
          accumulator[key] = sanitizedValue;
        }

        return accumulator;
      }, {});
    }

    return input;
  };

  return sanitize(value);
};

const wrapHistoryMethod = (methodName) => {
  if (typeof window === 'undefined' || !window.history?.[methodName]) {
    return;
  }

  const original = window.history[methodName];

  if (original.__historyStateSanitized === true) {
    return;
  }

  const wrapped = function historyStateSanitizedWrapper(state, unused, url) {
    try {
      return original.call(this, state, unused, url);
    } catch (error) {
      if (error?.name !== 'DataCloneError') {
        throw error;
      }

      const safeState = toHistorySafeState(state);
      return original.call(this, safeState, unused, url);
    }
  };

  wrapped.__historyStateSanitized = true;
  window.history[methodName] = wrapped;
};

export const installHistoryStateSanitizer = () => {
  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
};
