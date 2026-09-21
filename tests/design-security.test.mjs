import fs from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { PGlite } = require(
  process.env.PGLITE_TEST_MODULE || "@electric-sql/pglite",
);
test("registration throttle is atomic, service-only, repeatable and expires", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create table registration_requests(id int); grant all on registration_requests to anon,authenticated;",
    );
    const sql = fs.readFileSync(
      new URL("../supabase/migration_design_security.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec("set role anon");
    await assert.rejects(
      db.query("insert into registration_requests(id) values(1)"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select consume_registration_limit($1)", ["a".repeat(64)]),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.query("select consume_registration_limit($1) as allowed", [
          "a".repeat(64),
        ]),
      ),
    );
    assert.equal(attempts.filter((x) => x.rows[0].allowed).length, 5);
    await db.exec("reset role");
    await db.query(
      "update registration_rate_limits set window_start=now()-interval '2 hours'",
    );
    assert.equal(
      (
        await db.query("select consume_registration_limit($1) as allowed", [
          "a".repeat(64),
        ])
      ).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});
function registrationRoute() {
  const source = fs.readFileSync(
    new URL("../src/app/api/registrations/route.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(output, {
    module: compiled,
    exports: compiled.exports,
    process: { env: {} },
    require: (name) =>
      name === "next/server"
        ? {
            NextResponse: {
              json: (data, options) => ({
                data,
                status: options?.status || 200,
              }),
            },
          }
        : name === "@/lib/supabase/service"
          ? {
              createServiceClient: () => {
                throw Error("Invalid input reached database");
              },
            }
          : require(name),
  });
  return compiled.exports.POST;
}
const valid = {
  surname: "Example",
  first_name: "Sample",
  other_names: null,
  email: "sample@example.test",
  phone: "08012345678",
  street_id: null,
  house_number: "1",
  house_type: null,
  relationship: "family_member",
  consent: true,
  website: "",
};
for (const [name, body] of [
  ["missing consent", { ...valid, consent: false }],
  ["honeypot", { ...valid, website: "spam" }],
  ["field tampering", { ...valid, status: "approved" }],
  ["bad telephone", { ...valid, phone: "invalid" }],
])
  test("registration rejects " + name + " before database access", async () => {
    const result = await registrationRoute()({
      text: async () => JSON.stringify(body),
    });
    assert.equal(result.status, 400);
  });
test("registration accepts supported family-member shape then fails closed without server configuration", async () => {
  const result = await registrationRoute()({
    text: async () => JSON.stringify(valid),
  });
  assert.equal(result.status, 503);
});
