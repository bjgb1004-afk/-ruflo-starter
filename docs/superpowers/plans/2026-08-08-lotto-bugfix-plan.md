# 로또 앱 10개 버그 수정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로또 앱의 10개 버그를 4단계로 체계적 수정하고, 최종 전체 테스트 후 EAS 빌드 1회로 배포

**Architecture:** 
- 화면별 관련 버그끼리 묶어서 수정 (지도 → 판매점상세 → 당첨/QR → 상단바/관리자)
- 각 단계별 로컬 테스트 후 최종 통합 테스트 및 EAS 빌드
- Expo Router 구조 유지, 기존 코드 패턴 따르기

**Tech Stack:** 
- Expo SDK 54, React Native, TypeScript
- Expo Router, react-native-maps, react-native-barcode-scanner
- Supabase (백엔드)

## Global Constraints

- 모든 수정은 기존 코드 패턴을 따를 것
- 타입스크립트 타입 정의 필수
- 커밋은 단계별/기능별로 분리할 것
- 사용자 UX 우선 (성능/기술debt는 미룸)

---

## 1단계: 지도 관련 버그 수정

### Task 1: 지도에 순위 배지 표시 (#2)

**Files:**
- Modify: `app/features/map/components/StoreMapView.tsx` (마커에 배지 렌더링)
- Test: 앱 실행 후 지도에서 1/2/3 배지가 마커 위에 표시되는지 확인

**현재 상태:** 
- `app/(tabs)/index.tsx`에서 `topRecommendRanks` Map을 생성해서 `StoreMapView`에 전달 중
- `StoreMapView`에서 순위를 받아도 마커에 표시하지 않음

**해결책:**
- `StoreMapView` 내부에서 마커 렌더링 시, `topRecommendRanks`에 해당 store_id가 있으면 배지 표시
- 배지는 마커 위에 작은 원형으로 번호 표시 (1번=금색, 2번=은색, 3번=동색 또는 심플하게 번호만)

**구현 단계:**

- [ ] **Step 1:** `app/features/map/components/StoreMapView.tsx` 열기 및 현재 마커 렌더링 방식 확인
  
  ```bash
  # 파일 구조 확인
  cat app/features/map/components/StoreMapView.tsx | head -100
  ```

- [ ] **Step 2:** 마커 컴포넌트 내에서 순위 배지를 렌더링하는 JSX 추가

  **수정 전 (예시):**
  ```tsx
  <Marker coordinate={{ latitude: store.latitude, longitude: store.longitude }}>
    <View style={styles.markerContainer}>
      {/* 마커 내용 */}
    </View>
  </Marker>
  ```

  **수정 후 (예시):**
  ```tsx
  const rank = topRecommendRanks.get(store.store_id);
  <Marker coordinate={{ latitude: store.latitude, longitude: store.longitude }}>
    <View style={styles.markerContainer}>
      {/* 마커 내용 */}
      {rank && (
        <View style={[styles.rankBadge, styles[`rankBadge${rank}`]]}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
      )}
    </View>
  </Marker>
  ```

- [ ] **Step 3:** 배지 스타일 추가

  ```tsx
  const styles = StyleSheet.create({
    rankBadge: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#fff',
    },
    rankBadge1: { backgroundColor: '#FFD700' }, // 금색
    rankBadge2: { backgroundColor: '#C0C0C0' }, // 은색
    rankBadge3: { backgroundColor: '#CD7F32' }, // 동색
    rankText: {
      fontWeight: 'bold',
      fontSize: 12,
      color: '#fff',
    },
  });
  ```

- [ ] **Step 4:** 앱 실행해서 지도 화면에서 순위 배지가 보이는지 확인

  ```bash
  npx expo start
  # 앱에서 지도 화면 확인, 1/2/3 배지가 마커 위에 표시되는지 눈으로 확인
  ```

- [ ] **Step 5:** 커밋

  ```bash
  git add app/features/map/components/StoreMapView.tsx
  git commit -m "feat: 지도 마커에 추천순위 배지 표시 (1/2/3)"
  ```

---

### Task 2: 지도 이동 후 내 위치로 자동 돌아오는 문제 해결 (#3)

**Files:**
- Modify: `app/(tabs)/index.tsx` (지도 카메라 고정 방지)
- Test: 지도를 다른 지역으로 이동했을 때 내 위치로 돌아오지 않는지 확인

**현재 상태:**
- `handleRegionChangeComplete`에서 지도 이동을 감지하고 `queryCenter` 업데이트
- 하지만 카메라가 계속 내 위치(center)로 리셋되는 문제 있을 가능성

**해결책:**
- StoreMapView의 지도 카메라가 자동으로 `center`(내 위치)로 리셋되지 않도록 분리
- 사용자가 지도를 이동했으면 그 지역 기준으로 조회하되, 카메라는 그곳에 고정
- `focusCoordinate` prop 활용해서 명시적으로만 카메라 이동

**구현 단계:**

- [ ] **Step 1:** `StoreMapView.tsx` 확인 - 카메라가 `center` prop에 의존하는지 확인

  ```bash
  grep -n "camera\|center\|animateToRegion" app/features/map/components/StoreMapView.tsx | head -20
  ```

- [ ] **Step 2:** 문제 원인 파악 및 수정

  **일반적인 원인:** MapView의 `onRegionChangeComplete` 콜백 후 state 업데이트가 다시 렌더링을 트리거해서 `center` prop이 리셋됨

  **해결책:** 
  - `initialRegion` 사용 (처음 로드 시만)
  - 또는 `onRegionChangeComplete` 후 카메라 이동을 명시적으로 관리

  **수정 예시:**
  ```tsx
  // index.tsx에서
  const { data: stores = [], isLoading } = useNearbyStores(
    queryCenter?.latitude,
    queryCenter?.longitude,
    DEFAULT_SEARCH_RADIUS_M,
  );

  // StoreMapView에 queryCenter를 전달하고, center는 초기값으로만 사용
  <StoreMapView
    initialCenter={center}  // 초기값 (처음 로드 시만)
    queryCenter={queryCenter}  // 실제 조회 기준점 (지도 이동 시 변함)
    stores={sortedStores}
    // ... 기타 props
  />
  ```

- [ ] **Step 3:** 앱 실행해서 지도 이동 테스트

  ```bash
  npx expo start
  # 지도를 강남으로 이동 → 내 위치로 돌아오지 않는지 확인
  # 검색 결과가 이동한 지역 기준으로 변하는지 확인 (예: 강남 판매점 표시)
  ```

- [ ] **Step 4:** 커밋

  ```bash
  git add app/(tabs)/index.tsx app/features/map/components/StoreMapView.tsx
  git commit -m "fix: 지도 이동 후 내 위치로 자동 돌아오는 문제 해결"
  ```

---

## 2단계: 판매점 상세 페이지 버그 수정

### Task 3: 판매점 상세 - 당첨 이력칸 화면 짤림 (#4)

**Files:**
- Modify: `app/store/[id].tsx` (레이아웃 수정)
- Test: 판매점 상세에서 스크롤 가능한지, 당첨 이력이 모두 보이는지 확인

**현재 상태:**
- 당첨 이력이 많으면 화면 아래로 잘려서 보이지 않는 문제

**해결책:**
- 전체 화면을 ScrollView로 감싸거나, 당첨 이력 섹션을 FlatList로 변경
- 또는 당첨 이력 섹션만 내부 스크롤 적용

**구현 단계:**

- [ ] **Step 1:** `app/store/[id].tsx` 파일 열기 및 레이아웃 구조 확인 (처음 100줄)

  ```bash
  head -100 app/store/[id].tsx
  ```

- [ ] **Step 2:** 당첨 이력 렌더링 부분 찾기 및 스크롤 처리 추가

  **일반적인 수정:**
  - 전체 View → ScrollView로 변경
  - 또는 당첨 이력 부분을 FlatList로 변경

  ```tsx
  // 수정 전
  <View style={styles.container}>
    <Text>기본 정보</Text>
    {/* ... */}
    <Text>당첨 이력</Text>
    <FlatList data={winHistory} /* ... */ />
  </View>

  // 수정 후 (전체 스크롤)
  <ScrollView style={styles.container}>
    <Text>기본 정보</Text>
    {/* ... */}
    <Text>당첨 이력</Text>
    <FlatList 
      data={winHistory} 
      scrollEnabled={false}  // 내부 스크롤 비활성화 (부모 ScrollView에서 처리)
      /* ... */ 
    />
  </ScrollView>
  ```

- [ ] **Step 3:** 앱 실행 후 판매점 상세 페이지에서 스크롤 테스트

  ```bash
  npx expo start
  # 판매점 상세 클릭 → 전체 내용이 스크롤되는지, 당첨 이력이 모두 보이는지 확인
  ```

- [ ] **Step 4:** 커밋

  ```bash
  git add app/store/[id].tsx
  git commit -m "fix: 판매점 상세 당첨 이력칸 화면 짤림 문제 해결 (스크롤 추가)"
  ```

---

### Task 4: 판매점 상세 - 전화번호 표시 일관성 (#5)

**Files:**
- Modify: `app/store/[id].tsx` (전화번호 포맷 통일)
- Test: 여러 판매점의 전화번호가 일관된 형식으로 표시되는지 확인

**현재 상태:**
- 전화번호 표시가 제각각 (하이픈 위치 다름, 형식 불일치)

**해결책:**
- 전화번호 포맷팅 함수 작성 또는 기존 util 사용
- 모든 전화번호를 통일된 형식(예: 02-XXXX-XXXX)으로 표시

**구현 단계:**

- [ ] **Step 1:** 전화번호 포맷팅 함수 확인 또는 작성

  ```bash
  # 기존 util 함수가 있는지 확인
  grep -r "formatPhone\|phoneFormat" app --include="*.ts" --include="*.tsx"
  ```

- [ ] **Step 2:** 없으면 새로운 util 함수 작성 (`app/lib/formatPhone.ts`)

  ```typescript
  // app/lib/formatPhone.ts
  export function formatPhoneNumber(phone: string): string {
    // 숫자만 추출
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
      // 01012341234 → 010-1234-1234
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11) {
      // 01012341234 → 010-1234-1234
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 9) {
      // 0212341234 → 02-1234-1234
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    } else if (digits.length === 10 && digits.startsWith('02')) {
      // 0212341234 (10자) → 02-1234-1234
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    
    return phone; // 변환 불가능하면 원본 반환
  }
  ```

- [ ] **Step 3:** `app/store/[id].tsx`에서 전화번호 표시 부분에 함수 적용

  ```tsx
  import { formatPhoneNumber } from '@/lib/formatPhone';

  // 렌더링 시
  <Text>{formatPhoneNumber(store.phone)}</Text>
  ```

- [ ] **Step 4:** 앱 실행 후 여러 판매점의 전화번호 형식 확인

  ```bash
  npx expo start
  # 여러 판매점 상세를 열어서 전화번호가 02-XXXX-XXXX, 010-XXXX-XXXX 등 일관된 형식인지 확인
  ```

- [ ] **Step 5:** 커밋

  ```bash
  git add app/lib/formatPhone.ts app/store/[id].tsx
  git commit -m "fix: 판매점 전화번호 포맷 통일 (하이픈 형식 일관성)"
  ```

---

### Task 5: 판매점 상세 - 길찾기 버튼 기능 수정 (#6)

**Files:**
- Modify: `app/store/[id].tsx` (길찾기 네비게이션 수정)
- Test: 길찾기 클릭 시 네이버/카카오 지도에서 해당 판매점이 검색되는지 확인

**현재 상태:**
- 길찾기 버튼이 판매점이 아닌 내 위치로 네비게이션

**해결책:**
- 길찾기 버튼의 목적지를 현재 내 위치에서 **선택한 판매점 위치**로 변경
- `expo-linking` 또는 `react-native-maps` 딥링크 이용해서 지도 앱 열기

**구현 단계:**

- [ ] **Step 1:** `app/store/[id].tsx`에서 길찾기 버튼 코드 찾기

  ```bash
  grep -n "길찾기\|네비게이션\|direction\|navigate" app/store/[id].tsx
  ```

- [ ] **Step 2:** 현재 구현 방식 확인 및 수정

  **수정 예시 (나버 지도 딥링크 사용):**
  ```tsx
  import * as Linking from 'expo-linking';

  const handleNavigation = async () => {
    const url = `nmap://navigation?start=내위치&goal=${store.latitude},${store.longitude}&goalname=${store.name}`;
    
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // 네이버 지도 앱이 없으면 웹 지도 열기
        const webUrl = `https://map.naver.com/search/${encodeURIComponent(store.name)}`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  // JSX에서
  <Button title="길찾기" onPress={handleNavigation} />
  ```

- [ ] **Step 3:** 앱 실행 후 길찾기 테스트

  ```bash
  npx expo start
  # 판매점 상세에서 길찾기 클릭 → 네이버 지도 앱이 열리고 해당 판매점으로 네비게이션 시작하는지 확인
  ```

- [ ] **Step 4:** 커밋

  ```bash
  git add app/store/[id].tsx
  git commit -m "fix: 길찾기 네비게이션을 판매점 위치로 수정"
  ```

---

## 3단계: 당첨/QR 관련 버그 수정

### Task 6: 당첨확인 탭 위치 변경 (#7)

**Files:**
- Modify: `app/(tabs)/_layout.tsx` 또는 `app/(tabs)/ranking.tsx` (탭 순서 변경)
- Test: 탭 바에서 당첨확인이 지도 아래(우측)에 위치하는지 확인

**현재 상태:**
- 당첨확인 탭이 현재 위치에서 지도 아래로 이동해야 함

**해결책:**
- `app/(tabs)/_layout.tsx`에서 탭 바 순서를 조정하여 당첨확인을 마지막으로 이동

**구현 단계:**

- [ ] **Step 1:** `app/(tabs)/_layout.tsx` 파일 확인 - 현재 탭 구성 파악

  ```bash
  cat app/(tabs)/_layout.tsx | grep -A 30 "TabBar\|Tabs\|Screen name"
  ```

- [ ] **Step 2:** 탭 순서 변경 (당첨확인을 마지막으로)

  **일반적인 수정:**
  ```tsx
  // 수정 전 (예)
  <Tabs>
    <Tabs.Screen name="index" options={{ title: "지도" }} />
    <Tabs.Screen name="ranking" options={{ title: "당첨확인" }} />
    <Tabs.Screen name="stats" options={{ title: "통계" }} />
  </Tabs>

  // 수정 후
  <Tabs>
    <Tabs.Screen name="index" options={{ title: "지도" }} />
    <Tabs.Screen name="stats" options={{ title: "통계" }} />
    <Tabs.Screen name="ranking" options={{ title: "당첨확인" }} />
  </Tabs>
  ```

- [ ] **Step 3:** 앱 실행 후 탭 위치 확인

  ```bash
  npx expo start
  # 탭 바에서 당첨확인이 우측에 위치하는지 확인
  ```

- [ ] **Step 4:** 커밋

  ```bash
  git add app/(tabs)/_layout.tsx
  git commit -m "feat: 당첨확인 탭을 지도 아래로 이동"
  ```

---

### Task 7: QR 코드 인식 문제 해결 (#8)

**Files:**
- Modify: `app/scan.tsx` (QR 코드 인식 로직 수정)
- Test: 폰으로 QR 코드 촬영했을 때 올바르게 인식되는지 확인

**현재 상태:**
- 앱에서 QR 코드 인식 안 됨 (앱 내 카메라/스캔 이슈)
- 폰 기본 카메라로는 동행복권 QR이 잘 인식됨

**원인 분석:**
- `react-native-barcode-scanner` 또는 `expo-barcode-scanner` 라이브러리 설정 문제
- 권한 미허가 또는 카메라 초기화 실패

**해결책:**
- QR 스캔 라이브러리 재초기화 또는 업데이트
- 카메라 권한 명시적 요청
- 스캔 콜백 함수 검증 및 디버깅

**구현 단계:**

- [ ] **Step 1:** `app/scan.tsx` 파일 확인 - 현재 QR 스캔 구현 방식 파악

  ```bash
  head -150 app/scan.tsx
  ```

- [ ] **Step 2:** 사용 중인 라이브러리 확인 및 버전 체크

  ```bash
  grep -r "barcode\|scan\|camera" package.json
  ```

- [ ] **Step 3:** 권한 설정 확인 (`app.json` 또는 `app.config.ts`)

  ```bash
  grep -A 5 "camera\|permissions" app.config.ts app.json
  ```

  **필요한 권한:**
  ```json
  {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "카메라 접근이 필요합니다."
        }
      ]
    ]
  }
  ```

- [ ] **Step 4:** 카메라 권한 요청 로직 추가 (필요시)

  ```tsx
  import { useCameraPermissions } from 'expo-camera';

  export default function ScanScreen() {
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!permission?.granted) {
        requestPermission();
      }
    }, [permission]);

    // ... 카메라 초기화
  }
  ```

- [ ] **Step 5:** QR 스캔 콜백 함수 검증 및 로그 추가

  ```tsx
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    console.log('QR data:', data); // 디버깅 로그
    
    // QR 데이터 검증 및 처리
    try {
      // QR이 URL이면 파싱
      // QR이 로또 번호면 검증
    } catch (error) {
      console.error('QR parse error:', error);
    }
  };
  ```

- [ ] **Step 6:** 앱 실행 후 QR 스캔 테스트

  ```bash
  npx expo start
  # 동행복권 QR 코드 촬영 → 인식 및 처리 확인
  ```

- [ ] **Step 7:** 커밋

  ```bash
  git add app/scan.tsx app.config.ts
  git commit -m "fix: QR 코드 인식 기능 복구 (권한/초기화 개선)"
  ```

---

### Task 8: QR 버튼 화면 분할 UI 및 보관함 자동 이동 (#9)

**Files:**
- Modify: `app/scan.tsx` (UI 레이아웃 변경)
- Modify: `app/(tabs)/_layout.tsx` 또는 `app/scan.tsx` (네비게이션 연동)
- Test: QR 촬영 후 자동으로 보관함 화면으로 이동하는지 확인

**현재 상태:**
- QR 버튼이 단일 화면 전체 차지
- 촬영 후 보관함으로 자동 이동 안 됨

**해결책:**
- QR 카메라 화면을 화면의 절반(상단)으로 줄임
- 하단에 보관함 미리보기 또는 결과 표시
- QR 촬영 완료 시 보관함 화면으로 자동 네비게이션

**구현 단계:**

- [ ] **Step 1:** `app/scan.tsx` 레이아웃 구조 파악

  ```bash
  cat app/scan.tsx | head -100
  ```

- [ ] **Step 2:** 화면 분할 UI 구현 (상단 카메라, 하단 보관함)

  ```tsx
  import { View, StyleSheet } from 'react-native';

  export default function ScanScreen() {
    const router = useRouter();

    const handleBarCodeScanned = ({ data }: { data: string }) => {
      // QR 스캔 완료
      // 1. 데이터 검증
      // 2. 보관함에 저장
      // 3. 보관함 화면으로 네비게이션
      router.push('/mylotto');
    };

    return (
      <View style={styles.container}>
        {/* 상단: QR 카메라 (전체 높이의 50%) */}
        <View style={styles.cameraContainer}>
          <RNCamera onBarCodeRead={handleBarCodeScanned} />
        </View>

        {/* 하단: 보관함 미리보기 (전체 높이의 50%) */}
        <View style={styles.lottoPreview}>
          {/* 최근 저장된 로또 티켓 리스트 */}
        </View>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    cameraContainer: { flex: 0.5 },
    lottoPreview: { flex: 0.5, backgroundColor: '#fff' },
  });
  ```

- [ ] **Step 3:** QR 스캔 완료 후 보관함으로 자동 이동

  ```tsx
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    try {
      // 1. QR 데이터 검증 및 처리
      const lottoData = parseQRData(data);
      
      // 2. Supabase에 저장
      await saveLottoTicket(lottoData);
      
      // 3. 보관함 화면으로 이동 (약간의 딜레이 후)
      setTimeout(() => {
        router.push('/mylotto');
      }, 500);
    } catch (error) {
      // 에러 처리
      Alert.alert('QR 인식 실패', error.message);
    }
  };
  ```

- [ ] **Step 4:** 앱 실행 후 UI 및 자동 이동 테스트

  ```bash
  npx expo start
  # QR 화면이 상단 절반, 보관함 미리보기 하단 절반인지 확인
  # QR 촬영 후 보관함으로 자동 이동하는지 확인
  ```

- [ ] **Step 5:** 커밋

  ```bash
  git add app/scan.tsx
  git commit -m "feat: QR 버튼 화면 분할 UI + 촬영 후 보관함 자동 이동"
  ```

---

## 4단계: 상단바/관리자 버그 수정

### Task 9: 폰 상단바 상태 표시줄 표시 (#1)

**Files:**
- Modify: `app/_layout.tsx` (StatusBar 설정)
- Test: 앱 실행 시 상단 상태표시줄(시간, 신호, 배터리)이 보이는지 확인

**현재 상태:**
- StatusBar가 표시되지 않음

**해결책:**
- `expo-status-bar`에서 StatusBar import
- _layout.tsx에서 StatusBar 컴포넌트 추가

**구현 단계:**

- [ ] **Step 1:** `app/_layout.tsx` 파일 확인

  ```bash
  cat app/_layout.tsx
  ```

- [ ] **Step 2:** StatusBar import 및 설정 추가

  ```tsx
  // app/_layout.tsx
  import { StatusBar } from 'expo-status-bar';

  export default function RootLayout() {
    // ... 기존 코드

    return (
      <QueryClientProvider client={queryClient}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <Stack>
          {/* ... */}
        </Stack>
      </QueryClientProvider>
    );
  }
  ```

- [ ] **Step 3:** 앱 실행 후 상단 상태표시줄 확인

  ```bash
  npx expo start
  # 앱 상단에 시간, 신호, 배터리 아이콘이 보이는지 확인
  ```

- [ ] **Step 4:** 커밋

  ```bash
  git add app/_layout.tsx
  git commit -m "feat: 상단 상태표시줄(StatusBar) 표시"
  ```

---

### Task 10: 관리자 인증 - localhost 연결 거부 에러 해결 (#10)

**Files:**
- Modify: `app/admin.tsx` (OAuth 리다이렉트 URL 수정)
- Modify: `app.config.ts` (deep link 설정 확인)
- Test: 구글 로그인 후 Supabase 이메일 확인이 성공하는지 확인

**현재 상태:**
- 관리자 인증 페이지에서 구글 로그인 후 "localhost 연결 거부" 에러

**원인:**
- Supabase Auth의 리다이렉트 URL이 잘못 설정됨 (localhost → Supabase 콘솔에 등록된 URL과 불일치)
- 또는 deep link 설정 누락

**해결책:**
- `app.config.ts`에서 Supabase scheme 등록 확인
- Supabase 콘솔의 리다이렉트 URL에 `exp://` 또는 `custom-scheme://` 추가

**구현 단계:**

- [ ] **Step 1:** `app.config.ts` 파일 확인 - 현재 scheme 설정 파악

  ```bash
  cat app.config.ts | grep -A 5 "scheme\|redirect"
  ```

- [ ] **Step 2:** 앱의 deep link scheme 확인 또는 추가

  ```typescript
  // app.config.ts
  const scheme = 'your-app-scheme'; // 예: 'lotto' → 'lotto://'

  export default {
    // ...
    scheme: scheme,
    plugins: [
      // ...
      [
        'expo-auth-session/build/withScheme',
        {
          scheme: scheme,
        },
      ],
    ],
  };
  ```

- [ ] **Step 3:** Supabase 콘솔에서 리다이렉트 URL 설정

  ```
  Supabase Dashboard > Authentication > URL Configuration
  
  추가할 리다이렉트 URL:
  - exp://your-project.exp.direct/--/auth
  - lotto://auth/callback (앱 scheme 기반)
  - http://localhost:3000/auth/callback (로컬 테스트용)
  ```

- [ ] **Step 4:** `app/admin.tsx`에서 Supabase 리다이렉트 URL 설정 확인

  ```typescript
  import { createClient } from '@supabase/supabase-js';

  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );

  // OAuth 로그인 시 리다이렉트 URL 명시
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${scheme}://auth/callback`, // 명시적 리다이렉트
    },
  });
  ```

- [ ] **Step 5:** 앱 실행 후 관리자 인증 테스트

  ```bash
  npx expo start
  # 관리자 로그인 → 구글 인증 → Supabase 이메일 확인 → 성공 확인
  ```

- [ ] **Step 6:** 커밋

  ```bash
  git add app/admin.tsx app.config.ts
  git commit -m "fix: 관리자 인증 localhost 에러 해결 (OAuth 리다이렉트 URL 수정)"
  ```

---

## 최종 단계: 전체 테스트 및 EAS 빌드

### Task 11: 통합 테스트 및 EAS 빌드

**Files:**
- Test: 모든 화면 및 기능 테스트
- Deploy: EAS 빌드 1회

**테스트 체크리스트:**

- [ ] **1단계 (지도) 테스트:**
  - [ ] 지도 화면에서 1/2/3 순위 배지가 마커에 표시됨
  - [ ] 지도를 다른 지역으로 이동해도 내 위치로 돌아오지 않음
  - [ ] 이동한 지역의 판매점이 검색되어 표시됨

- [ ] **2단계 (판매점 상세) 테스트:**
  - [ ] 판매점 상세에서 전체 내용이 스크롤되며 당첨 이력이 모두 보임
  - [ ] 전화번호가 일관된 형식(02-XXXX-XXXX, 010-XXXX-XXXX)으로 표시됨
  - [ ] 길찾기 클릭 시 네이버 지도 앱이 해당 판매점으로 열림

- [ ] **3단계 (당첨/QR) 테스트:**
  - [ ] 탭 바에서 당첨확인이 우측(지도 아래)에 위치
  - [ ] QR 화면에서 상단 절반은 카메라, 하단 절반은 보관함 미리보기
  - [ ] QR 코드 촬영 후 자동으로 보관함 화면으로 이동

- [ ] **4단계 (상단바/관리자) 테스트:**
  - [ ] 앱 실행 시 상단에 시간/신호/배터리 상태표시줄이 보임
  - [ ] 관리자 로그인 성공 (구글 인증 → 이메일 확인 → 완료)

**EAS 빌드 실행:**

- [ ] **Step 1:** 모든 변경사항 커밋 확인

  ```bash
  git status  # clean 상태 확인
  git log --oneline | head -10  # 최근 커밋 확인
  ```

- [ ] **Step 2:** EAS 빌드 트리거

  ```bash
  eas build --platform ios --auto-submit  # iOS 빌드 (옵션)
  # 또는
  eas build --platform android  # Android 빌드
  ```

- [ ] **Step 3:** 빌드 완료 대기 및 모니터링

  ```bash
  eas build --status  # 빌드 상태 확인
  ```

- [ ] **Step 4:** 빌드 완료 후 테스트 기기에 설치 및 최종 검증

- [ ] **Step 5:** 최종 커밋 및 태그 생성

  ```bash
  git tag -a v1.0.1 -m "fix: design.txt 10개 버그 수정 + 전체 테스트 완료"
  git push origin main
  git push origin v1.0.1
  ```

---

## 완료 체크리스트

- [ ] Task 1: 지도 순위 배지 표시
- [ ] Task 2: 지도 이동 후 내 위치로 돌아오는 문제 해결
- [ ] Task 3: 판매점 상세 당첨 이력 화면 짤림
- [ ] Task 4: 전화번호 표시 일관성
- [ ] Task 5: 길찾기 버튼 기능 수정
- [ ] Task 6: 당첨확인 탭 위치 변경
- [ ] Task 7: QR 코드 인식 문제 해결
- [ ] Task 8: QR 화면 분할 UI + 보관함 자동 이동
- [ ] Task 9: 상단 상태표시줄 표시
- [ ] Task 10: 관리자 인증 localhost 에러 해결
- [ ] Task 11: 통합 테스트 + EAS 빌드 1회

---

**Plan written to:** `docs/superpowers/plans/2026-08-08-lotto-bugfix-plan.md`
