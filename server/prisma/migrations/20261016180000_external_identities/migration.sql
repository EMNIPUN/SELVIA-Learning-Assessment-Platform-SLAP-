-- External identity links: verified bindings from an external IdP (issuer + subject)
-- to a platform user. Revoked rows are kept for audit. Active uniqueness is partial:
-- the same (issuer, subject) or (user_id, issuer) may reappear only after revocation.

CREATE TYPE "external_identity_link_method" AS ENUM ('ADMIN_VERIFIED');

CREATE TABLE "external_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issuer" VARCHAR(512) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "link_method" "external_identity_link_method" NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by_user_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_identities_issuer_subject_idx" ON "external_identities"("issuer", "subject");
CREATE INDEX "external_identities_user_id_issuer_idx" ON "external_identities"("user_id", "issuer");

-- At most one active owner of a given external identity.
CREATE UNIQUE INDEX "external_identities_issuer_subject_active_key"
    ON "external_identities"("issuer", "subject")
    WHERE "revoked_at" IS NULL;

-- At most one active external identity per platform user per issuer.
CREATE UNIQUE INDEX "external_identities_user_issuer_active_key"
    ON "external_identities"("user_id", "issuer")
    WHERE "revoked_at" IS NULL;

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_linked_by_user_id_fkey"
    FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_revoked_by_user_id_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_issuer_not_blank_check"
    CHECK (length(trim(both FROM "issuer")) > 0);

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_subject_not_blank_check"
    CHECK (length(trim(both FROM "subject")) > 0);

ALTER TABLE "external_identities"
    ADD CONSTRAINT "external_identities_revocation_pair_check"
    CHECK (
        ("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL)
        OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL)
    );
