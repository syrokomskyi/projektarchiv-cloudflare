// @vitest-environment node

import fc from "fast-check";
import { expect, it } from "vitest";

import { SqliteProjectRevisionCoordinator } from "../coordinator/sqlite-project-revision-coordinator.ts";
import { artifactId, reservationId, scope, timestamp } from "../testing/fixtures.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";

it("preserves monotonic never-reused revisions across arbitrary abandon patterns", async () => {
  // Property: reservation state never affects the strictly increasing allocation counter.
  await fc.assert(
    fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }), async (abandon) => {
      const storage = new NodeSqlStorage();
      try {
        const coordinator = new SqliteProjectRevisionCoordinator(storage, scope);
        const revisions: number[] = [];
        for (const [index, shouldAbandon] of abandon.entries()) {
          const result = await coordinator.reserveRevision({
            scope,
            artifactId,
            reservationId: reservationId(1000 + index),
            operationId: `property-${index}`,
            createdAt: timestamp,
          });
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          revisions.push(result.value.revision);
          if (shouldAbandon) {
            const transitioned = await coordinator.advanceReservation({
              scope,
              reservationId: result.value.reservationId,
              expectedState: "reserved",
              nextState: "abandoned",
              updatedAt: timestamp,
            });
            expect(transitioned.ok).toBe(true);
          }
        }
        expect(revisions).toEqual(abandon.map((_, index) => index + 1));
      } finally {
        storage.close();
      }
    }),
    { numRuns: 50 },
  );
});
