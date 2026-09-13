// 客户端 fetch 封装：自动携带访问密码（若服务端启用 ACCESS_PASSWORD）。

export class UnauthorizedError extends Error {
  constructor() {
    super("需要访问密码");
  }
}

export class ApiError extends Error {}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const password =
    typeof window !== "undefined"
      ? sessionStorage.getItem("access_password")
      : null;
  const headers = new Headers(init?.headers);
  if (password) headers.set("x-access-password", password);
  return fetch(path, { ...init, headers });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `请求失败（HTTP ${res.status}）`);
  }
  return res.json() as Promise<T>;
}
