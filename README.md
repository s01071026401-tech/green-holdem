# GREEN HOLDEM — Expo + Colyseus

6인 초대 코드 비공개 텍사스 홀덤. 가입/현금 결제 없는 무료 플레이. 시작 스택: 10,000칩, 블라인드: 50/100.

## 선행 설치

- **Node.js 22.13 이상 LTS**, VS Code 및 인터넷(npm 의존성 설치용)
- Android / iPhone에 Expo Go 설치. 컴퓨터와 두 휴대폰을 **같은 Wi-Fi**에 연결
- SDK 57 호환 Expo Go가 필요. 앱스토어의 Expo Go 버전이 58만 지원하는 경우 Expo 개발 빌드 또는 SDK 58로 마이그레이션 필요

## 1. 서버 실행 — 첫 번째 VS Code 터미널

```powershell
cd holdem-server
npm install
npm run typecheck
npm test
npm run dev
```

서버는 `http://컴퓨터IP:2567`에서 대기. 서버 터미널을 계속 켜 둘 것.
Windows에서 IP 확인: `ipconfig` -> Wi-Fi 어댑터의 IPv4 주소 (예: 192.168.0.10).
Windows 방화벽이 Node.js 2567 포트의 개인 네트워크 접속을 막으면 허용.

## 2. 앱 설치 및 실행 — 두 번째 터미널

```powershell
cd holdem-app
npm install
npx expo install --fix
```

`holdem-app/.env` 파일을 생성하고 IP를 실제 PC IPv4로 수정:

```env
EXPO_PUBLIC_SERVER_URL=http://192.168.0.10:2567
```

절대 `localhost` 또는 `127.0.0.1`을 입력하지 말 것: 휴대폰에서는 휴대폰 자신을 가리킴.

```powershell
npm run typecheck
npx expo start --clear
```

Expo Go에서 QR코드를 열고 같은 앱을 두 기기에서 실행.

> iPhone의 Expo Go는 Expo 계정 로그인 요건이 있을 수 있음. 필요 시 Expo CLI / Expo Go에 같은 Expo 계정으로 로그인.

## 3. 플레이 테스트

1. 휴대폰 A에서 닉네임 입력 -> **새 비공개 방 만들기**.
2. A 화면에 보이는 **초대 코드(roomId 전체 문자열)**를 B에게 전송.
3. B가 **코드로 입장** -> A/B 모두 두 플레이어를 확인.
4. 어느 쪽에서든 **게임 시작** -> 카드 2장 비공개 분배, 50/100 블라인드.
5. 플레이어 차례에 폴드 / 체크 / 콜 / 레이즈(총 베팅액) / 올인 실행.
6. 프리플랍 → 플랍 → 턴 → 리버 → 쇼다운; 사이드 팟과 동률 분배.
7. 핸드 종료 후 다음 핸드 시작. 0칩 플레이어는 다음 핸드에 참가할 수 없음.

## 주요 로직

- 덱: Node `crypto.randomInt`를 사용한 Fisher-Yates 셔플.
- 족보: 7장에서 5장을 선택하는 21개 조합을 비교.
- 베팅: 서버 검증. `raise.amount`는 **이번 스트리트에 대한 총 베팅액**, 추가 칩 금액이 아님.
- 사이드 팟: 누적 투자 금액별 레벨 구성. 폴드 플레이어는 팟 출자만 하고 당첨 불가.
- 비공개 카드: 참가자별 `snapshot` 개인 메시지로 자기 카드만 보냄. 쇼다운에는 생존 플레이어 핸드 공개.
- 게임방: Colyseus `create('holdem')` / `joinById(roomId)`; `setPrivate(true)`.

## 제한 및 주의

**학습용 MVP입니다.** 이 실행환경에서는 npm 패키지를 다운로드하지 못해 설치/실제 기기 테스트를 완료하지 못했습니다. 로직은 제공된 Node 테스트에 따라 로컬에서 반드시 확인하세요.

- 계정, 게임 전적 보관, 스택 구매, 환전, 리바이, 토너먼트는 미구현.
- 연결이 끊긴 플레이어는 현재 핸드에서 폴드, 재접속/좌석 복구 미구현.
- 서버가 재시작되면 방과 스택이 초기화됨.
- 모든 참가자가 칩이 없으면 새 게임방 생성이 필요.
- 악의적 봇/다중계정 방지, 인증, 레이트 리미트, 안티치트, 행동 타이머, 대규모 부하 시험은 미구현.
- 친구들이 다른 Wi-Fi에 있다면, **공인 HTTPS/WSS로 접근 가능한 Colyseus 서버** 배포가 필요. `.env`의 주소도 배포 서버 URL로 교체해야 함.
- 이 코드는 원칙적으로 한 프로세스 서버를 가정. 여러 서버 확장 시 Redis Presence / Driver 등 추가 검토 필요.
- 외부 사용자를 대상으로 공개할 때는 보안 및 법규, 플랫폼 정책 검토 필요.

## 해결법

- `Network request failed`: PC/폰 같은 Wi-Fi인지 확인, IP 주소/서버 실행/방화벽 확인.
- `Room ... not found`: 코드가 잘못되었거나 마지막 참가자가 나간 후 방이 폐기됨.
- `Room ... locked`: 정원 6명 초과.
- `React Native version mismatch`: `npx expo install --fix`, `npx expo start --clear`, Expo Go SDK 호환성 확인.
- 버전 충돌은 `npm ls expo react react-native @colyseus/sdk`로 확인.

## 참고 문서
- Expo https://docs.expo.dev/get-started/start-developing/
- Colyseus https://docs.colyseus.io/server
- Colyseus SDK https://docs.colyseus.io/sdk
