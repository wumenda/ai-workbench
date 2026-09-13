// 简单访问密码：设置 ACCESS_PASSWORD 环境变量后启用。
// 客户端通过 x-access-password 请求头携带密码。

export function checkAuth(req: Request): Response | null {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return null;
  if (req.headers.get("x-access-password") === password) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
