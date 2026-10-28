# Atlas manages database/migrations from database/schema.sql.
#
# Run from apps/daemon/database. The daemon applies the migrations itself at start-up (src/database/migrate.ts) and
# does not runs Atlas.
#
# After editing schema.sql, create a new migration:
#   atlas migrate diff v0_2_0 --env local
#
# Check that the migrations add up to schema.sql:
#   atlas schema diff --env local --from file://migrations --to env://src


# Atlas bug where it only recognises a partial index whose WHERE is uppercase.
data "external_schema" "schema" {
  program = ["sed", "-e", "s/^where /WHERE /", "schema.sql"]
}

env "local" {
  src = data.external_schema.schema.url
  dev = "sqlite://dev?mode=memory"
  migration {
    dir = "file://migrations"
  }
}
