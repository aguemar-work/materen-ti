// Los builders de postgrest-js implementan `.then()`, así que son "thenable".
// Si una función `async` los devuelve, `await fn()` ejecuta la query en vez
// de entregar el builder para encadenar `.range()` / `.limit()`. Envolver en
// un objeto evita esa adopción automática de Promise.
export function entregarQuery(qb) {
  return { qb };
}
