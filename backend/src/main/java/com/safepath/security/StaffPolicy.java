package com.safepath.security;

/**
 * Single source of truth for "who is an admin".
 * An account is staff ONLY if its role is "admin" AND its email is on the
 * company domain. Either one alone grants nothing.
 */
public final class StaffPolicy {

    public static final String STAFF_DOMAIN = "@safepath.com";

    private StaffPolicy() {
    }

    public static boolean isStaffEmail(String email) {
        return email != null
                && email.trim().toLowerCase().endsWith(STAFF_DOMAIN)
                && email.trim().length() > STAFF_DOMAIN.length();
    }

    public static boolean isAdmin(String role, String email) {
        return role != null
                && "admin".equalsIgnoreCase(role.trim())
                && isStaffEmail(email);
    }

    /** The role the rest of the system (and the app) should believe. */
    public static String effectiveRole(String role, String email) {
        return isAdmin(role, email) ? "admin" : "user";
    }
}
