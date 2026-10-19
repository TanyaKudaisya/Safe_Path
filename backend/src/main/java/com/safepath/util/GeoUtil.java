package com.safepath.util;

public final class GeoUtil {

    private static final double EARTH_RADIUS_M = 6_371_000.0;

    private GeoUtil() {
    }

    /** Great-circle distance in metres. */
    public static double haversineMeters(
            double lat1, double lon1, double lat2, double lon2
    ) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    public static boolean isValidCoordinate(Double lat, Double lon) {
        return lat != null && lon != null
                && lat >= -90 && lat <= 90
                && lon >= -180 && lon <= 180
                && !(lat == 0 && lon == 0);
    }
}
