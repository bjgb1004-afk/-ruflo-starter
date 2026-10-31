import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export function useCurrentLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "다시 묻기"가 가능한지(= OS가 허용/거부를 다시 물어볼 수 있는지). 안드로이드에서
  // "이번만 허용"을 거치면 앱이 재시작될 때마다 이 권한이 조용히 풀리는데, 그때도
  // canAskAgain은 true라서 설정 화면까지 안 나가고 바로 재요청 다이얼로그를 띄울 수 있다.
  // "다시 묻지 않음"으로 완전히 거부된 경우만 false가 되고, 그때는 설정 화면으로 보낸다.
  const [canAskAgain, setCanAskAgain] = useState(true);
  const isMountedRef = useRef(true);

  const request = useCallback(async () => {
    try {
      const { status, canAskAgain: askAgain } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current) return;
      setCanAskAgain(askAgain);
      if (status !== "granted") {
        setError("위치 권한이 거부되었습니다.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (isMountedRef.current) {
        setLocation(current);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    request();
    return () => {
      isMountedRef.current = false;
    };
  }, [request]);

  return { location, error, canAskAgain, retry: request };
}
