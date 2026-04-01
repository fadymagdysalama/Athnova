import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

export type EdgeFunctionResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
  responseText: string;
};

const SESSION_REFRESH_BUFFER_MS = 60 * 1000;
const SESSION_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 20000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function loadSession(forceRefresh = false) {
  const sessionResult = forceRefresh
    ? await withTimeout(supabase.auth.refreshSession(), SESSION_TIMEOUT_MS, 'Session refresh')
    : await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS, 'Session lookup');

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  return sessionResult.data.session;
}

async function validateAccessToken(accessToken: string): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase.auth.getUser(accessToken),
    SESSION_TIMEOUT_MS,
    'Session validation',
  );

  return !error && Boolean(data.user);
}

async function getValidAccessToken(forceRefresh = false): Promise<string | null> {
  let activeSession = await loadSession(forceRefresh);

  if (!forceRefresh && activeSession?.expires_at) {
    const expiresAtMs = activeSession.expires_at * 1000;
    if (expiresAtMs <= Date.now() + SESSION_REFRESH_BUFFER_MS) {
      activeSession = await loadSession(true);
    }
  }

  const accessToken = activeSession?.access_token ?? null;
  if (!accessToken) {
    return null;
  }

  const isTokenValid = await validateAccessToken(accessToken);
  if (isTokenValid) {
    return accessToken;
  }

  const refreshedSession = await loadSession(true);
  const refreshedAccessToken = refreshedSession?.access_token ?? null;
  if (!refreshedAccessToken) {
    return null;
  }

  return (await validateAccessToken(refreshedAccessToken)) ? refreshedAccessToken : null;
}

async function performEdgeFunctionRequest(
  functionName: string,
  payload: object,
  accessToken: string,
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function invokeEdgeFunction<T>(
  functionName: string,
  payload: object,
): Promise<EdgeFunctionResult<T>> {
  let accessToken: string | null;

  try {
    accessToken = await getValidAccessToken();
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to load access token',
      status: 0,
      responseText: '',
    };
  }

  if (!accessToken) {
    return {
      data: null,
      error: 'Missing access token',
      status: 0,
      responseText: '',
    };
  }

  let response: Response;
  let responseText: string;

  try {
    response = await performEdgeFunctionRequest(functionName, payload, accessToken);
    responseText = await response.text();
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Edge Function request failed',
      status: 0,
      responseText: '',
    };
  }

  if (response.status === 401 && responseText.includes('Invalid JWT')) {
    try {
      accessToken = await getValidAccessToken(true);
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Session refresh failed',
        status: response.status,
        responseText,
      };
    }

    if (!accessToken) {
      return {
        data: null,
        error: 'Unable to refresh access token',
        status: response.status,
        responseText,
      };
    }

    try {
      response = await performEdgeFunctionRequest(functionName, payload, accessToken);
      responseText = await response.text();
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Retried Edge Function request failed',
        status: 0,
        responseText: '',
      };
    }
  }

  let data: T | null = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText) as T;
    } catch {
      data = null;
    }
  }

  return {
    data,
    error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
    status: response.status,
    responseText,
  };
}