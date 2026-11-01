import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

/**
 * 현재 위치. **스스로 권한을 묻지 않는다** - `request()`를 부르는 쪽이 시점을 정한다.
 *
 * 왜 이렇게 바꿨나(2026-11-01): 예전엔 화면이 뜨자마자 물었다. 그래서 처음 설치한 사람은
 * "왜 위치가 필요한지" 설명을 보기 **전에** OS 권한 창을 먼저 봤다. 설명 모달은 로딩이
 * 끝난 뒤에야 그려졌기 때문이다. 모르고 거부하면 지도 앱이 반쪽이 되고, 첫 실행 206명 중
 * 40명이 앱을 지웠다(2026-10-31 점검).
 *
 * `asked`는 "이 앱 실행에서 한 번이라도 물어봤는지"다. 부르는 쪽이 "아직 안 물어봤을 뿐"과
 * "물어봤는데 아직 답이 없다"를 구분해야 로딩 스피너에 갇히지 않는다.
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "다시 묻기"가 가능한지(= OS가 허용/거부를 다시 물어볼 수 있는지). 안드로이드에서
  // "이번만 허용"을 거치면 앱이 재시작될 때마다 이 권한이 조용히 풀리는데, 그때도
  // canAskAgain은 true라서 설정 화면까지 안 나가고 바로 재요청 다이얼로그를 띄울 수 있다.
  // "다시 묻지 않음"으로 완전히 거부된 경우만 false가 되고, 그때는 설정 화면으로 보낸다.
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [asked, setAsked] = useState(false);
  const isMountedRef = useRef(true);

  const request = useCallback(async () => {
    setAsked(true);
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
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { location, error, canAskAgain, asked, request, retry: request };
}
