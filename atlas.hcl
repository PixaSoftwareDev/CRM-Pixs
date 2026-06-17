// Atlas configuration for PIXS migrations.
// Usage: atlas migrate apply --env local
// Docs:  https://atlasgo.io/atlas-schema/projects

variable "database_url" {
  type    = string
  default = getenv("PIXS_DATABASE_URL")
}

env "local" {
  src = "file://db/migrations"
  url = var.database_url

  migration {
    dir = "file://db/migrations"
  }

  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}

env "prod" {
  src = "file://db/migrations"
  url = var.database_url

  migration {
    dir = "file://db/migrations"
  }
}
