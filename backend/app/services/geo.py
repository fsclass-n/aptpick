import math

import numpy as np

EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1, lng1, lat2, lng2):
    """두 좌표(배열 가능) 사이의 거리(m)"""
    lat1, lng1, lat2, lng2 = map(np.radians, (lat1, lng1, lat2, lng2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


def offset(lat: float, lng: float, north_m: float, east_m: float) -> tuple[float, float]:
    d_lat = north_m / 111_320
    d_lng = east_m / (111_320 * math.cos(math.radians(lat)))
    return round(lat + d_lat, 6), round(lng + d_lng, 6)
