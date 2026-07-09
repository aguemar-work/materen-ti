import { describe, it, expect } from 'vitest';
import { entregarQuery } from '../src/api/entregarQuery.js';

describe('entregarQuery', () => {
  it('evita que await en función async ejecute un builder thenable', async () => {
    let ejecutada = false;
    const builder = {
      then(onFulfilled) {
        ejecutada = true;
        return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled);
      },
      range(desde, hasta) {
        return { desde, hasta, ejecutada };
      },
    };

    async function obtenerQuery() {
      return entregarQuery(builder);
    }

    const { qb } = await obtenerQuery();
    expect(ejecutada).toBe(false);
    expect(qb.range(0, 19)).toEqual({ desde: 0, hasta: 19, ejecutada: false });
  });
});
