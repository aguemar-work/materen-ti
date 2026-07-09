// Stub de npm:@insforge/sdk para tests unitarios: los helpers puros que se
// prueban no tocan el SDK. Si un test llega a llamarlo, debe fallar fuerte.
export function createClient() {
  throw new Error('createClient no debe llamarse en tests unitarios');
}

export function createAdminClient() {
  throw new Error('createAdminClient no debe llamarse en tests unitarios');
}
