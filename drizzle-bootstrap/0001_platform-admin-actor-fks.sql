ALTER TABLE "gym_invitations" DROP CONSTRAINT "gym_invitations_invited_by_platform_admin_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gym_membership_roles" DROP CONSTRAINT "gym_membership_roles_granted_by_platform_admin_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gym_membership_roles" DROP CONSTRAINT "gym_membership_roles_revoked_by_platform_admin_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_invited_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("invited_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_granted_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("granted_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_revoked_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("revoked_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;