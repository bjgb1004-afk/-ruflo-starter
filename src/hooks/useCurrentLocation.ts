import { useEffect, useState } from "react";
import * as Location from "expo-location";

export function useCurrentLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (isMounted) setError("위치 권한이 거부되었습니다.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (isMounted) setLocation(current);
    })().catch((err) => {
      if (isMounted) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { location, error };
}
