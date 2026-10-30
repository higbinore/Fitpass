CREATE TABLE "payment_reference_registry" (
	"reference" text PRIMARY KEY NOT NULL,
	"payment_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reference_type_valid" CHECK ("payment_reference_registry"."payment_type" in ('gym', 'platform'))
);
