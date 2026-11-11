/* Node 로 돌리는 엔진 테스트:  node test/rotation.test.js  */
const assert = require('assert');
const R = require('../src/Rotation.gs');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL  ' + name + '\n        ' + e.message);
    process.exitCode = 1;
  }
}

const CFG = { anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6], doorDows: [3] };

test('9월 격자가 원본 표와 같은 주 구성을 만든다', () => {
  const g = R.ceMonthGrid(2026, 9);
  assert.strictEqual(g.weeks.length, 5);
  assert.strictEqual(g.startIso, '2026-08-31');
  assert.strictEqual(g.endIso, '2026-10-03');
  assert.deepStrictEqual(g.weeks[0].map(c => c.day), [31, 1, 2, 3, 4, 5]);
  assert.deepStrictEqual(g.weeks[4].map(c => c.day), [28, 29, 30, 1, 2, 3]);
  assert.strictEqual(g.weeks[0][0].inMonth, false);   // 8/31
  assert.strictEqual(g.weeks[4][3].inMonth, false);   // 10/1
});

test('주일은 새벽예배 배정에서 빠진다', () => {
  const s = R.ceBuildSchedule(CFG, { sermon: ['가'], broadcast: ['ㄱ'], door: ['A'] }, [], '2026-09-06');
  assert.ok(!s.byIso['2026-09-06'], '9/6 은 주일이라 배정이 없어야 한다');
  assert.ok(s.byIso['2026-09-05']);
});

test('명단 순서대로 돌아간다', () => {
  const rot = { sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ'], door: ['A', 'B'] };
  const s = R.ceBuildSchedule(CFG, rot, [], '2026-09-12');
  const seq = s.dawnDays.slice(0, 6).map(d => d.preacher);
  assert.deepStrictEqual(seq, ['가', '나', '다', '가', '나', '다']);
});

test('수요현관은 수요일에만, 순서대로 배정된다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], door: ['A', 'B', 'C'] };
  const s = R.ceBuildSchedule(CFG, rot, [], '2026-09-19');
  assert.deepStrictEqual(s.doorDays.map(d => d.iso), ['2026-09-02', '2026-09-09', '2026-09-16']);
  assert.deepStrictEqual(s.doorDays.map(d => d.door), ['A', 'B', 'C']);
  assert.strictEqual(s.byIso['2026-09-03'].door, '');
});

test('휴가자는 건너뛰고 다음 순서자가 들어간다', () => {
  const rot = { sermon: ['가', '나', '다'], broadcast: ['ㄱ'], door: ['A'] };
  // '나' 가 9/1 하루 휴가 -> 그날은 '다', 그 다음 9/2 는 '가' 로 이어짐
  const ex = [{ name: '나', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '가');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '다');
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '가');
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '나');   // 건너뛴 차례는 소진되지 않는다
});

test('기간 휴가는 그 기간 내내 제외된다', () => {
  const rot = { sermon: ['가', '나'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = [{ name: '나', start: '2026-08-31', end: '2026-09-05', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    .forEach(iso => assert.strictEqual(s.byIso[iso].preacher, '가', iso));
});

test('같은 날 여러 명이 빠지면 가능한 사람이 나올 때까지 건너뛴다', () => {
  const rot = { sermon: ['김', '이', '박', '최', '정'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = [
    { name: '이', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL },
    { name: '박', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }
  ];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '김');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '최');   // 이·박 둘 다 건너뜀
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '정');
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '김');
  assert.strictEqual(s.byIso['2026-09-04'].preacher, '이');   // 건너뛴 차례가 다음 바퀴에 돌아온다
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '박');
});

test('명단 한 명 빼고 전부 빠져도 그 한 명이 들어간다', () => {
  const rot = { sermon: ['김', '이', '박', '최'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = ['김', '이', '박'].map(n =>
    ({ name: n, start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }));
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-01');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '최');
  assert.strictEqual(s.byIso['2026-09-01'].warning, '');
});

test('설교와 방송에서 각각 여러 명이 빠져도 서로 간섭하지 않는다', () => {
  const rot = { sermon: ['김', '이', '박'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'], door: ['A'] };
  const ex = [
    { name: '김', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL },
    { name: '이', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL },
    { name: 'ㄴ', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL },
    { name: 'ㄷ', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }
  ];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-01');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '박');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, 'ㄱ');
});

test('여러 명이 여러 날에 걸쳐 겹쳐 빠지는 경우', () => {
  const rot = { sermon: ['김', '이', '박', '최'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = [
    { name: '이', start: '2026-08-31', end: '2026-09-02', role: R.CE_ROLE.ALL },
    { name: '박', start: '2026-09-01', end: '2026-09-03', role: R.CE_ROLE.ALL }
  ];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '김');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '최');   // 이·박 모두 휴가
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '김');
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '이');   // 이는 9/3 복귀, 박은 아직 휴가
  assert.strictEqual(s.byIso['2026-09-04'].preacher, '박');   // 박도 복귀
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '최');
});

test('달력에 하루씩 찍은 여러 날도 기간 휴가와 똑같이 동작한다', () => {
  // 달력 탭은 하루짜리 기록만 쌓으므로, 실제로는 이 모양으로 들어옵니다.
  const rot = { sermon: ['가', '나'], broadcast: ['ㄱ'], door: ['A'] };
  const perDay = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
    .map(iso => ({ name: '나', start: iso, end: iso, role: R.CE_ROLE.ALL }));
  const asRange = [{ name: '나', start: '2026-08-31', end: '2026-09-05', role: R.CE_ROLE.ALL }];
  const a = R.ceBuildSchedule(CFG, rot, perDay, '2026-09-05');
  const b = R.ceBuildSchedule(CFG, rot, asRange, '2026-09-05');
  assert.deepStrictEqual(a.byIso, b.byIso);
});

test('역할을 지정한 예외는 그 역할에만 적용된다', () => {
  const ex = [{ name: '가', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.BROADCAST }];
  assert.strictEqual(R.ceIsAvailable('가', '2026-09-01', R.CE_ROLE.BROADCAST, ex), false);
  assert.strictEqual(R.ceIsAvailable('가', '2026-09-01', R.CE_ROLE.SERMON, ex), true);
});

test('설교자와 방송실이 겹치면 방송실을 다음날과 맞바꾼다', () => {
  // 같은 명단, 같은 순서 -> 매일 겹친다
  const rot = { sermon: ['가', '나', '다'], broadcast: ['가', '나', '다'], door: ['A'] };
  const s = R.ceBuildSchedule(CFG, rot, [], '2026-09-05');
  const d = s.dawnDays;
  // 첫날은 다음날 방송실과 맞바뀐 모양이어야 한다
  assert.strictEqual(d[0].broadcast, '나');
  assert.strictEqual(d[1].broadcast, '가');
  // 남은 겹침이 있다면 반드시 이유가 붙어 있어야 한다 (조용히 두지 않는다)
  d.forEach(day => {
    if (day.preacher && day.preacher === day.broadcast) {
      assert.ok(day.warning, day.iso + ' 에 겹침이 남았는데 경고가 없다');
    }
  });
});

test('맞바꿔도 겹치면 그 다음날로 밀어서 찾는다', () => {
  const days = [
    { iso: '2026-09-01', preacher: '가', broadcast: '가' },
    { iso: '2026-09-02', preacher: '나', broadcast: '가' },   // 여기로 바꾸면 i 일이 그대로 겹침
    { iso: '2026-09-03', preacher: '다', broadcast: '라' }
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, '라');
  assert.strictEqual(days[2].broadcast, '가');
  assert.ok(!days[0].warning);
});

test('맞바꿀 상대가 휴가면 건너뛴다', () => {
  const days = [
    { iso: '2026-09-01', preacher: '가', broadcast: '가' },
    { iso: '2026-09-02', preacher: '나', broadcast: '라' },
    { iso: '2026-09-03', preacher: '다', broadcast: '마' }
  ];
  const ex = [{ name: '라', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.BROADCAST }];
  R.ceResolveConflicts(days, ex);
  assert.strictEqual(days[0].broadcast, '마');
  assert.strictEqual(days[2].broadcast, '가');
});

test('바꿀 상대가 아예 없으면 경고를 남긴다', () => {
  const days = [{ iso: '2026-09-01', preacher: '가', broadcast: '가' }];
  R.ceResolveConflicts(days, []);
  assert.ok(days[0].warning);
});

test('명단 전원이 휴가면 빈칸으로 두고 넘어간다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = [{ name: '가', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-02');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '');
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '가');
});

test('같은 달을 몇 번 계산해도 결과가 같다', () => {
  const rot = { sermon: ['가', '나', '다', '라'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'], door: ['A', 'B'] };
  const a = R.ceBuildSchedule(CFG, rot, [], '2026-10-03');
  const b = R.ceBuildSchedule(CFG, rot, [], '2026-10-03');
  assert.deepStrictEqual(a.byIso, b.byIso);
});

test('앞뒤 달 시트에서 겹치는 날짜의 배정이 서로 같다', () => {
  const rot = { sermon: ['가', '나', '다', '라'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'], door: ['A', 'B'] };
  const sep = R.ceBuildSchedule(CFG, rot, [], R.ceMonthGrid(2026, 9).endIso);
  const oct = R.ceBuildSchedule(CFG, rot, [], R.ceMonthGrid(2026, 10).endIso);
  ['2026-09-28', '2026-10-01', '2026-10-03'].forEach(iso => {
    assert.strictEqual(sep.byIso[iso].preacher, oct.byIso[iso].preacher, iso);
    assert.strictEqual(sep.byIso[iso].broadcast, oct.byIso[iso].broadcast, iso);
  });
});

test('휴일로 잡은 날은 아무도 배정되지 않는다', () => {
  const rot = { sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ'], door: ['A'] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '');
  assert.strictEqual(s.byIso['2026-09-01'].offSermon, true);
  assert.strictEqual(s.byIso['2026-09-01'].offBroadcast, true);
});

test('휴일에는 로테이션 순번이 소모되지 않는다', () => {
  const rot = { sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ'], door: ['A'] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '가');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '');
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '나');   // 쉬어도 '나' 차례가 그대로 온다
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '다');
});

test('휴가 스킵과 달리 휴일은 아무 순번도 건드리지 않는다', () => {
  const rot = { sermon: ['가', '나', '다'], broadcast: ['ㄱ'], door: ['A'] };
  const withHoliday = R.ceBuildSchedule(
    CFG, rot, [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }], '2026-09-05');
  const withLeave = R.ceBuildSchedule(
    CFG, rot, [{ name: '나', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }], '2026-09-05');
  assert.strictEqual(withHoliday.byIso['2026-09-02'].preacher, '나');
  assert.strictEqual(withLeave.byIso['2026-09-02'].preacher, '가');
});

test('휴일(방송) 은 방송실만 비운다', () => {
  const rot = { sermon: ['가', '나'], broadcast: ['ㄱ', 'ㄴ'], door: ['A'] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.BROADCAST }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '나');    // 설교는 그대로 배정
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '');
  assert.strictEqual(s.byIso['2026-09-01'].offBroadcast, true);
  assert.strictEqual(s.byIso['2026-09-01'].offSermon, false);
  assert.strictEqual(s.byIso['2026-09-02'].broadcast, 'ㄴ');   // 방송 순번은 그대로
});

test('수요일이 휴일이면 수요저녁 현관도 비고 순번이 유지된다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], door: ['A', 'B', 'C'] };
  const ex = [{ name: '휴일', start: '2026-09-09', end: '2026-09-09', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-16');
  assert.strictEqual(s.byIso['2026-09-02'].door, 'A');
  assert.strictEqual(s.byIso['2026-09-09'].door, '');
  assert.strictEqual(s.byIso['2026-09-09'].offDoor, true);
  assert.strictEqual(s.byIso['2026-09-16'].door, 'B');
});

test('기간으로 잡은 휴일 (성탄 연휴 등)', () => {
  const rot = { sermon: ['가', '나'], broadcast: ['ㄱ'], door: ['A'] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-04', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].forEach(iso => {
    assert.strictEqual(s.byIso[iso].preacher, '', iso);
    assert.strictEqual(s.byIso[iso].broadcast, '', iso);
  });
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '가');
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '나');
});

test('휴일인 날은 방송실 교대 상대로 쓰이지 않는다', () => {
  // 9/1 이 휴일이라 방송실이 비어 있으므로, 8/31 의 충돌은 9/2 와 맞바꿔 푼다
  const rot = { sermon: ['가', '나', '다'], broadcast: ['가', '나', '다'], door: ['A'] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '');
  assert.notStrictEqual(s.byIso['2026-08-31'].preacher, s.byIso['2026-08-31'].broadcast);
  assert.strictEqual(s.byIso['2026-08-31'].broadcast, '나');
  assert.strictEqual(s.byIso['2026-09-02'].broadcast, '가');
});

test('휴일 대신 쓸 수 있는 말들', () => {
  ['휴일', '휴무', '없음', '직접입력'].forEach(word => {
    assert.strictEqual(R.ceIsHolidayName(word), true, word);
  });
  assert.strictEqual(R.ceIsHolidayName('홍길동'), false);
  assert.strictEqual(R.ceIsHolidayName(' 휴일 '), true);
});

test('휴일 판정은 역할 범위를 지킨다', () => {
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.DOOR }];
  assert.strictEqual(R.ceIsHoliday('2026-09-01', R.CE_ROLE.DOOR, ex), true);
  assert.strictEqual(R.ceIsHoliday('2026-09-01', R.CE_ROLE.SERMON, ex), false);
  assert.strictEqual(R.ceIsHoliday('2026-09-02', R.CE_ROLE.DOOR, ex), false);
});

test('요일 목록 파싱', () => {
  assert.deepStrictEqual(R.ceParseDowList('월,화,수,목,금,토'), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(R.ceParseDowList('수요일'), [3]);
  assert.deepStrictEqual(R.ceParseDowList(''), []);
});

test('역할 이름 파싱', () => {
  assert.strictEqual(R.ceNormalizeRole('방송실'), R.CE_ROLE.BROADCAST);
  assert.strictEqual(R.ceNormalizeRole('현관'), R.CE_ROLE.DOOR);
  assert.strictEqual(R.ceNormalizeRole(''), R.CE_ROLE.ALL);
  assert.strictEqual(R.ceNormalizeRole('알수없음'), R.CE_ROLE.ALL);
});

/* ---------- 토요일 별도 명단 · 수요현관/토요찬양 ---------- */

const SAT_CFG = {
  anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6],
  satDows: [6], doorDows: [3], praiseDows: [6]
};

test('토요일은 토요 명단으로, 평일은 평일 명단으로 각각 돈다', () => {
  const rot = {
    sermon: ['김', '이', '박'], broadcast: ['ㄱ', 'ㄴ'],
    satSermon: ['토설1', '토설2'], satBroadcast: ['토방1', '토방2'],
    door: ['현관1'], praise: ['찬양1']
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  // 평일에는 토요 명단 사람이 나오지 않는다
  s.dawnDays.filter(d => d.dow !== 6).forEach(d => {
    assert.ok(['김', '이', '박'].indexOf(d.preacher) >= 0, d.iso + ' 설교자: ' + d.preacher);
    assert.ok(['ㄱ', 'ㄴ'].indexOf(d.broadcast) >= 0, d.iso + ' 방송실: ' + d.broadcast);
  });
  // 토요일에는 토요 명단 사람만 나온다
  s.dawnDays.filter(d => d.dow === 6).forEach(d => {
    assert.ok(['토설1', '토설2'].indexOf(d.preacher) >= 0, d.iso + ' 설교자: ' + d.preacher);
    assert.ok(['토방1', '토방2'].indexOf(d.broadcast) >= 0, d.iso + ' 방송실: ' + d.broadcast);
  });
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '토설1');
  assert.strictEqual(s.byIso['2026-09-12'].preacher, '토설2');
});

test('토요일을 빼도 평일 순번은 끊기지 않는다', () => {
  const rot = {
    sermon: ['김', '이', '박'], broadcast: ['ㄱ'],
    satSermon: ['토설'], satBroadcast: ['토방'], door: [], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-08');
  // 8/31 김, 9/1 이, 9/2 박, 9/3 김, 9/4 이, (9/5 토요일은 별도), 9/7 박, 9/8 김
  assert.strictEqual(s.byIso['2026-09-04'].preacher, '이');
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '토설');
  assert.strictEqual(s.byIso['2026-09-07'].preacher, '박');
  assert.strictEqual(s.byIso['2026-09-08'].preacher, '김');
});

test('토요 명단을 비워 두면 평일 명단으로 그냥 이어서 돈다', () => {
  const rot = { sermon: ['김', '이', '박'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [], door: [], praise: [] };
  const withSat = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-08');
  const legacy = R.ceBuildSchedule(CFG, { sermon: ['김', '이', '박'], broadcast: ['ㄱ'], door: [] }, [], '2026-09-08');
  assert.strictEqual(withSat.byIso['2026-09-05'].preacher, legacy.byIso['2026-09-05'].preacher);
  assert.strictEqual(withSat.byIso['2026-09-07'].preacher, legacy.byIso['2026-09-07'].preacher);
});

test('토요설교만 따로 두고 방송은 평일 명단으로 이어갈 수 있다', () => {
  const rot = {
    sermon: ['김', '이'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'],
    satSermon: ['토설'], satBroadcast: [], door: [], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-05');
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '토설');
  // 방송은 평일 명단이 끊기지 않고 이어진다: 8/31 ㄱ, 9/1 ㄴ, 9/2 ㄷ, 9/3 ㄱ, 9/4 ㄴ, 9/5 ㄷ
  assert.strictEqual(s.byIso['2026-09-05'].broadcast, 'ㄷ');
});

test('토요찬양은 토요일에만, 수요현관은 수요일에만 들어간다', () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [],
    door: ['현관1', '현관2'], praise: ['찬양1', '찬양2']
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.doorDays.map(d => d.iso), ['2026-09-02', '2026-09-09']);
  assert.deepStrictEqual(s.praiseDays.map(d => d.iso), ['2026-09-05', '2026-09-12']);
  assert.strictEqual(s.byIso['2026-09-02'].door, '현관1');
  assert.strictEqual(s.byIso['2026-09-02'].praise, '');
  assert.strictEqual(s.byIso['2026-09-05'].praise, '찬양1');
  assert.strictEqual(s.byIso['2026-09-05'].door, '');
  assert.strictEqual(s.byIso['2026-09-09'].door, '현관2');
  assert.strictEqual(s.byIso['2026-09-12'].praise, '찬양2');
});

test('수요현관과 토요찬양은 서로 다른 순번을 쓴다', () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [],
    door: ['A', 'B', 'C'], praise: ['A', 'B', 'C']
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-19');
  assert.deepStrictEqual(s.doorDays.map(d => d.door), ['A', 'B', 'C']);
  assert.deepStrictEqual(s.praiseDays.map(d => d.praise), ['A', 'B', 'C']);
});

test('방송실 교대는 같은 명단 안에서만 일어난다', () => {
  const rot = {
    sermon: ['김', '이', '박'], broadcast: ['ㄱ', 'ㄴ'],
    satSermon: ['토가', '토나'], satBroadcast: ['토가', '토나'],
    door: [], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-26');
  // 토요일끼리 맞바뀌었을 뿐, 평일 사람이 토요일로 넘어오지 않는다
  s.dawnDays.filter(d => d.dow === 6).forEach(d => {
    assert.ok(['토가', '토나'].indexOf(d.broadcast) >= 0, d.iso + ' : ' + d.broadcast);
    assert.notStrictEqual(d.preacher, d.broadcast, d.iso + ' 에서 아직 겹친다');
  });
  s.dawnDays.filter(d => d.dow !== 6).forEach(d => {
    assert.ok(['ㄱ', 'ㄴ'].indexOf(d.broadcast) >= 0, d.iso + ' : ' + d.broadcast);
  });
  assert.strictEqual(s.byIso['2026-09-05'].swapNote, '2026-09-12 과 맞바꿈');
});

test('토요 방송 명단이 한 명뿐이라 바꿀 상대가 없으면 경고가 남는다', () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄱ'],
    satSermon: ['혼자'], satBroadcast: ['혼자'], door: [], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  assert.ok(s.byIso['2026-09-05'].warning, '경고가 있어야 한다');
});

test("'휴일(토요찬양)' 은 찬양만 비운다", () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [],
    door: [], praise: ['찬양1', '찬양2']
  };
  const ex = [{ name: '휴일', start: '2026-09-05', end: '2026-09-05', role: R.CE_ROLE.PRAISE }];
  const s = R.ceBuildSchedule(SAT_CFG, rot, ex, '2026-09-12');
  assert.strictEqual(s.byIso['2026-09-05'].praise, '');
  assert.strictEqual(s.byIso['2026-09-05'].offPraise, true);
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '김');       // 설교는 그대로
  assert.strictEqual(s.byIso['2026-09-12'].praise, '찬양1');      // 순번은 유지
});

test('빈칸이 명단 없음 때문인지 전원 예외 때문인지 구분한다', () => {
  const noList = R.ceBuildSchedule(SAT_CFG,
    { sermon: ['김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [], door: [], praise: [] },
    [], '2026-09-05');
  assert.strictEqual(noList.byIso['2026-09-05'].praise, '');
  assert.strictEqual(noList.byIso['2026-09-05'].gapPraise, false);   // 명단이 없으니 알릴 일이 아니다

  const allOut = R.ceBuildSchedule(SAT_CFG,
    { sermon: ['김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [], door: [], praise: ['찬양1'] },
    [{ name: '찬양1', start: '2026-09-05', end: '2026-09-05', role: R.CE_ROLE.ALL }], '2026-09-05');
  assert.strictEqual(allOut.byIso['2026-09-05'].praise, '');
  assert.strictEqual(allOut.byIso['2026-09-05'].gapPraise, true);    // 이건 알려야 한다
});

test('토요찬양 역할 이름 파싱', () => {
  assert.strictEqual(R.ceNormalizeRole('토요찬양'), R.CE_ROLE.PRAISE);
  assert.strictEqual(R.ceNormalizeRole('찬양'), R.CE_ROLE.PRAISE);
});


/* ---------- 수요현관·토요찬양은 겹쳐도 그냥 순서대로 ---------- */

test('수요현관이 그날 설교자와 겹쳐도 그대로 둔다', () => {
  const rot = {
    sermon: ['ㄴ', 'ㄷ', '오', '김'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [],
    door: ['오', '윤'], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-09');
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '오');
  assert.strictEqual(s.byIso['2026-09-02'].door, '오', '겹쳐도 명단 순서 그대로');
  assert.strictEqual(s.byIso['2026-09-09'].door, '윤');
});

test('수요현관이 그날 방송실과 겹쳐도 그대로 둔다', () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄴ', 'ㄷ', '오', 'ㄱ'], satSermon: [], satBroadcast: [],
    door: ['오', '윤'], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-09');
  assert.strictEqual(s.byIso['2026-09-02'].broadcast, '오');
  assert.strictEqual(s.byIso['2026-09-02'].door, '오');
});

test('토요찬양이 그날 토요설교와 겹쳐도 그대로 둔다', () => {
  const rot = {
    sermon: ['김'], broadcast: ['ㄱ'],
    satSermon: ['강', '조'], satBroadcast: ['임'],
    door: [], praise: ['강', '서']
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  assert.strictEqual(s.byIso['2026-09-05'].preacher, '강');
  assert.strictEqual(s.byIso['2026-09-05'].praise, '강', '겹쳐도 명단 순서 그대로');
  assert.strictEqual(s.byIso['2026-09-12'].praise, '서');
});

test('넷째 줄은 겹쳐도 경고를 남기지 않는다', () => {
  const rot = {
    sermon: ['오'], broadcast: ['ㄱ'], satSermon: [], satBroadcast: [],
    door: ['오'], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-09');
  assert.strictEqual(s.byIso['2026-09-02'].door, '오');
  assert.strictEqual(s.byIso['2026-09-02'].warning, '');
});

test('넷째 줄 순번은 설교·방송 교대에 영향받지 않는다', () => {
  const rot = {
    sermon: ['가', '나', '다'], broadcast: ['가', '나', '다'], satSermon: [], satBroadcast: [],
    door: ['A', 'B'], praise: ['C', 'D']
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.doorDays.map(d => d.door), ['A', 'B']);
  assert.deepStrictEqual(s.praiseDays.map(d => d.praise), ['C', 'D']);
});

/* ---------- 금요일 겹침은 토요일을 건너뛰고 다음 월요일과 ---------- */

function weekDay(iso, dow, preacher, broadcast) {
  return { iso: iso, dow: dow, preacher: preacher, broadcast: broadcast, bcGroup: 'broadcast', swapGroup: 'week' };
}
function satDay(iso, preacher, broadcast, bcGroup) {
  return { iso: iso, dow: 6, preacher: preacher, broadcast: broadcast, bcGroup: bcGroup || 'satBroadcast', swapGroup: 'sat' };
}

test('금요일에 겹치면 토요일을 건너뛰고 다음 월요일과 맞바꾼다', () => {
  const days = [
    weekDay('2026-09-04', 5, 'X', 'X'),
    satDay('2026-09-05', '강', '임'),
    weekDay('2026-09-07', 1, '가', 'ㄱ')
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, 'ㄱ');
  assert.strictEqual(days[1].broadcast, '임', '토요일은 건드리지 않는다');
  assert.strictEqual(days[2].broadcast, 'X');
  assert.strictEqual(days[0].swapNote, '2026-09-07 과 맞바꿈');
});

test('토요 명단을 비워 둬도 금요일은 토요일이 아니라 월요일과 바뀐다', () => {
  // 토요방송이 비어 평일 명단으로 돌더라도 토요일은 토요일끼리만 바꿉니다.
  const days = [
    weekDay('2026-09-04', 5, 'X', 'X'),
    satDay('2026-09-05', '강', '임', 'broadcast'),
    weekDay('2026-09-07', 1, '가', 'ㄱ')
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, 'ㄱ');
  assert.strictEqual(days[1].broadcast, '임');
  assert.strictEqual(days[2].broadcast, 'X');
});

test('월요일 다음이 안 되면 그 다음 평일로 밀어서 찾는다', () => {
  const days = [
    weekDay('2026-09-04', 5, 'X', 'X'),
    satDay('2026-09-05', '강', '임'),
    weekDay('2026-09-07', 1, '가', 'X'),      // 바꿔도 금요일이 그대로 겹침
    weekDay('2026-09-08', 2, '나', 'ㄴ')
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, 'ㄴ');
  assert.strictEqual(days[3].broadcast, 'X');
  assert.strictEqual(days[1].broadcast, '임');
});

test('10/23(금) 겹침 -> 10/24(토)를 건너뛰고 10/26(월) 방송실과 맞바꾼다', () => {
  const cfg = { anchor: '2026-09-28', dawnDows: [1, 2, 3, 4, 5, 6], satDows: [6], doorDows: [3], praiseDows: [6] };
  const rot = {
    sermon: ['가', '나', '다', '라', '마', '바'],
    broadcast: ['ㄱ', '나', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ'],   // 2번 자리가 설교자와 같은 사람
    satSermon: ['강'], satBroadcast: ['임'], door: [], praise: []
  };
  const s = R.ceBuildSchedule(cfg, rot, [], R.ceMonthGrid(2026, 10).endIso);

  assert.strictEqual(s.byIso['2026-10-23'].preacher, '나', '10/23 설교자');
  assert.strictEqual(s.byIso['2026-10-23'].broadcast, 'ㄷ', '10/26 방송실을 데려온다');
  assert.strictEqual(s.byIso['2026-10-26'].broadcast, '나', '10/23 방송실이 넘어간다');
  assert.strictEqual(s.byIso['2026-10-23'].swapNote, '2026-10-26 과 맞바꿈');
  assert.strictEqual(s.byIso['2026-10-24'].broadcast, '임', '10/24 토요일은 그대로');
});

test('토요일 겹침은 다음 토요일과 바꾼다 (평일로 넘어가지 않는다)', () => {
  const days = [
    satDay('2026-09-05', 'S', 'S'),
    weekDay('2026-09-07', 1, '가', 'ㄱ'),
    satDay('2026-09-12', '조', '임')
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, '임');
  assert.strictEqual(days[1].broadcast, 'ㄱ', '평일은 건드리지 않는다');
  assert.strictEqual(days[2].broadcast, 'S');
});

test('배정 전체에서도 금요일 겹침이 월요일로 간다', () => {
  // 8/31 월 ~ 9/5 토. 금요일(9/4) 설교자와 방송이 같아지도록 맞춘 구성
  const rot = {
    sermon: ['가', '나', '다', '라', 'ㄱ'],
    broadcast: ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'],
    satSermon: [], satBroadcast: [], door: [], praise: []
  };
  const s = R.ceBuildSchedule(SAT_CFG, rot, [], '2026-09-12');
  s.dawnDays.forEach(d => {
    if (d.preacher && d.broadcast) {
      assert.notStrictEqual(d.preacher, d.broadcast, d.iso + ' 에서 아직 겹친다');
    }
  });
  // 맞바꾼 자리는 모두 같은 요일 묶음(평일↔평일, 토요↔토요) 안에서만 일어난다
  const byIso = {};
  s.dawnDays.forEach(d => { byIso[d.iso] = d; });
  s.dawnDays.filter(d => d.swapNote).forEach(d => {
    const partner = byIso[d.swapNote.split(' ')[0]];
    if (partner) assert.strictEqual(partner.swapGroup, d.swapGroup, d.iso + ' 의 상대가 다른 묶음이다');
  });
});

/* ---------- 맞바꿀 상대가 없을 때 ---------- */

test('맞바꿀 상대가 없으면 그대로 두고 경고를 남긴다 (대타는 쓰지 않는다)', () => {
  const days = [{ iso: '2026-09-01', preacher: '가', broadcast: '가', bcGroup: 'broadcast' }];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, '가', '다른 사람을 데려오면 안 된다');
  assert.ok(days[0].warning);
  assert.strictEqual(days[0].swapNote, undefined);
});

test('맞바꿀 수 있으면 맞바꾼다 (명단에 사람이 더 있어도 데려오지 않는다)', () => {
  const days = [
    { iso: '2026-09-01', preacher: '가', broadcast: '가', bcGroup: 'broadcast' },
    { iso: '2026-09-02', preacher: '나', broadcast: '다', bcGroup: 'broadcast' }
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, '다');
  assert.strictEqual(days[1].broadcast, '가');
  assert.ok(days[0].swapNote.indexOf('맞바꿈') >= 0);
});

/* ---------- 휴일(설교) · 휴일(백업) 명단 ---------- */

const HOL_CFG = {
  anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6],
  satDows: [6], doorDows: [3], praiseDows: [6]
};

test('휴일로 잡은 날은 휴일 명단에서 순서대로 들어간다', () => {
  const rot = {
    sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'],
    holidaySermon: ['휴설1', '휴설2'], holidayBroadcast: ['휴백1', '휴백2']
  };
  const ex = [
    { name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL },
    { name: '휴일', start: '2026-09-03', end: '2026-09-03', role: R.CE_ROLE.ALL }
  ];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-05');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '휴설1');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '휴백1');
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '휴설2');
  assert.strictEqual(s.byIso['2026-09-03'].broadcast, '휴백2');
});

test('휴일 명단을 써도 평일 순번은 그대로 이어진다', () => {
  const rot = {
    sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ', 'ㄷ'],
    holidaySermon: ['휴설1'], holidayBroadcast: ['휴백1']
  };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-04');
  assert.strictEqual(s.byIso['2026-08-31'].preacher, '가');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '휴설1');
  assert.strictEqual(s.byIso['2026-09-02'].preacher, '나', '휴일이 평일 순번을 쓰면 안 된다');
  assert.strictEqual(s.byIso['2026-09-03'].preacher, '다');
});

test('휴일 명단이 비어 있으면 예전처럼 빈칸으로 둔다', () => {
  const rot = { sermon: ['가', '나'], broadcast: ['ㄱ', 'ㄴ'], holidaySermon: [], holidayBroadcast: [] };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-03');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '');
  assert.strictEqual(s.byIso['2026-09-01'].offSermon, true);
});

test("'휴일(방송)' 이면 설교는 평일 명단, 방송만 휴일 명단", () => {
  const rot = {
    sermon: ['가', '나'], broadcast: ['ㄱ', 'ㄴ'],
    holidaySermon: ['휴설1'], holidayBroadcast: ['휴백1']
  };
  const ex = [{ name: '휴일', start: '2026-09-01', end: '2026-09-01', role: R.CE_ROLE.BROADCAST }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-03');
  assert.strictEqual(s.byIso['2026-09-01'].preacher, '나');
  assert.strictEqual(s.byIso['2026-09-01'].broadcast, '휴백1');
});

test('휴일 명단으로 채운 날은 방송실 교대 상대로 쓰지 않는다', () => {
  const days = [
    weekDay('2026-09-01', 2, 'X', 'X'),
    { iso: '2026-09-02', dow: 3, preacher: '휴설1', broadcast: '휴백1', bcGroup: 'holidayBroadcast', swapGroup: 'holiday' },
    weekDay('2026-09-03', 4, '가', 'ㄱ')
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[1].broadcast, '휴백1', '휴일 칸은 건드리지 않는다');
  assert.strictEqual(days[0].broadcast, 'ㄱ');
  assert.strictEqual(days[2].broadcast, 'X');
});

/* ---------- 현관안내 ---------- */

test('현관안내는 수요일이 있는 주마다 세 명씩 돌아간다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    usher: ['안1', '안2', '안3', '안4', '안5', '안6', '안7']
  };
  const s = R.ceBuildSchedule(HOL_CFG, rot, [], R.ceMonthGrid(2026, 9).endIso);
  assert.deepStrictEqual(s.usherWeeks.map(w => w.iso),
    ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안1', '안2', '안3']);
  assert.deepStrictEqual(s.usherWeeks[1].ushers, ['안4', '안5', '안6']);
  assert.deepStrictEqual(s.usherWeeks[2].ushers, ['안7', '안1', '안2']);
});

test('현관안내 명단이 세 명보다 적으면 있는 사람만 들어간다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], usher: ['안1', '안2'] };
  const s = R.ceBuildSchedule(HOL_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안1', '안2']);
  assert.strictEqual(s.usherWeeks[0].gapUsher, true);
});

test('현관안내 명단이 비면 빈 자리로 두고 이유를 남긴다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], usher: [] };
  const s = R.ceBuildSchedule(HOL_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, []);
  assert.strictEqual(s.usherWeeks[0].gapUsher, false, '명단이 없는 건 예외와 다르다');
});

test('현관안내 예외자는 건너뛰고 다음 사람이 들어간다', () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], usher: ['안1', '안2', '안3', '안4'] };
  const ex = [{ name: '안2', start: '2026-09-02', end: '2026-09-02', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안1', '안3', '안4']);
});

test("그냥 '휴일' 이면 현관안내는 비우지 않는다", () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], usher: ['안1', '안2', '안3'] };
  const ex = [{ name: '휴일', start: '2026-09-02', end: '2026-09-02', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안1', '안2', '안3']);
  assert.strictEqual(s.usherWeeks[0].offUsher, false);
});

test("'휴일(현관안내)' 이면 그 주 현관안내만 비운다", () => {
  const rot = { sermon: ['가'], broadcast: ['ㄱ'], usher: ['안1', '안2', '안3'] };
  const ex = [{ name: '휴일', start: '2026-09-02', end: '2026-09-02', role: R.CE_ROLE.USHER }];
  const s = R.ceBuildSchedule(HOL_CFG, rot, ex, '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, []);
  assert.strictEqual(s.usherWeeks[0].offUsher, true);
  assert.deepStrictEqual(s.usherWeeks[1].ushers, ['안1', '안2', '안3'], '순번은 소모되지 않는다');
});

/* ---------- 현관안내는 그 주 수요백업·토요백업과 겹치지 않는다 ---------- */

const USH_CFG = {
  anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6],
  satDows: [6], doorDows: [3], praiseDows: [6]
};

test('그 주 수요백업으로 선 사람은 현관안내에 세우지 않는다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1'], praise: [],
    usher: ['안1', '안2', '안3', '안4', '안5']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-12');
  assert.strictEqual(s.byIso['2026-09-02'].door, '안1');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안2', '안3', '안4']);
  assert.ok(s.usherWeeks[0].ushers.indexOf('안1') < 0);
});

test('그 주 토요백업으로 선 사람도 세우지 않는다 (토요일이 수요일보다 뒤여도)', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: [], praise: ['안1'],
    usher: ['안1', '안2', '안3', '안4']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-12');
  assert.strictEqual(s.byIso['2026-09-05'].praise, '안1');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안2', '안3', '안4']);
});

test('수요백업과 토요백업이 서로 다른 사람이면 둘 다 빠진다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1'], praise: ['안2'],
    usher: ['안1', '안2', '안3', '안4', '안5']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안3', '안4', '안5']);
  assert.deepStrictEqual(s.usherWeeks[0].busy, ['안1', '안2']);
});

test('겹쳐서 건너뛴 사람의 차례는 다음 주에 그대로 돌아온다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1', '안2'], praise: [],
    usher: ['안1', '안2', '안3', '안4', '안5']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-19');
  // 1주차 수요백업 안1 -> 안1 을 건너뛰고 안2·안3·안4
  assert.strictEqual(s.byIso['2026-09-02'].door, '안1');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안2', '안3', '안4']);
  // 2주차 수요백업 안2 -> 건너뛰었던 안1 이 다시 들어온다
  assert.strictEqual(s.byIso['2026-09-09'].door, '안2');
  assert.deepStrictEqual(s.usherWeeks[1].ushers, ['안5', '안1', '안3']);
});

test('겹침을 빼고 나면 세 명이 안 되는 경우 있는 사람만 세우고 알려 준다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1'], praise: ['안2'],
    usher: ['안1', '안2', '안3']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안3']);
  assert.strictEqual(s.usherWeeks[0].gapUsher, true);
});

test('현관안내 전원이 그 주 백업과 겹치면 빈칸으로 두고 알려 준다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1'], praise: ['안2'],
    usher: ['안1', '안2']
  };
  const s = R.ceBuildSchedule(USH_CFG, rot, [], '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, []);
  assert.strictEqual(s.usherWeeks[0].gapUsher, true);
});

test('겹침 규칙이 들어가도 달마다 따로 계산한 결과가 서로 같다', () => {
  const rot = {
    sermon: ['가', '나', '다'], broadcast: ['ㄱ', 'ㄴ'],
    satSermon: ['강'], satBroadcast: ['임'],
    door: ['안1', '안2', '안3'], praise: ['안4', '안5'],
    usher: ['안1', '안2', '안3', '안4', '안5', '안6', '안7']
  };
  const seen = {};
  [[2026, 9], [2026, 10], [2026, 11], [2026, 12]].forEach(ym => {
    const g = R.ceMonthGrid(ym[0], ym[1]);
    const s = R.ceBuildSchedule(USH_CFG, rot, [], g.endIso);
    s.usherWeeks.forEach(w => {
      if (seen[w.iso]) {
        assert.deepStrictEqual(w.ushers, seen[w.iso], w.iso + ' 의 현관안내가 달마다 다르다');
      }
      seen[w.iso] = w.ushers.slice();
    });
  });
});

test('현관안내 예외자와 백업 겹침이 함께 걸려도 된다', () => {
  const rot = {
    sermon: ['가'], broadcast: ['ㄱ'],
    door: ['안1'], praise: [],
    usher: ['안1', '안2', '안3', '안4', '안5']
  };
  const ex = [{ name: '안2', start: '2026-09-02', end: '2026-09-02', role: R.CE_ROLE.ALL }];
  const s = R.ceBuildSchedule(USH_CFG, rot, ex, '2026-09-12');
  assert.deepStrictEqual(s.usherWeeks[0].ushers, ['안3', '안4', '안5']);
});

test('그 주의 시작(월요일) 을 구한다', () => {
  assert.strictEqual(R.ceWeekStart('2026-09-02'), '2026-08-31');   // 수
  assert.strictEqual(R.ceWeekStart('2026-09-05'), '2026-08-31');   // 토
  assert.strictEqual(R.ceWeekStart('2026-08-31'), '2026-08-31');   // 월
  assert.strictEqual(R.ceWeekStart('2026-09-07'), '2026-09-07');
});

test('cePickNext 에 막을 사람을 넘길 수 있다', () => {
  const list = ['가', '나', '다'];
  const open = R.cePickNext(list, 0, '2026-09-01', R.CE_ROLE.ALL, []);
  assert.strictEqual(open.name, '가');
  const blocked = R.cePickNext(list, 0, '2026-09-01', R.CE_ROLE.ALL, [], ['가']);
  assert.strictEqual(blocked.name, '나');
  assert.strictEqual(blocked.ptr, 2, '막힌 사람의 차례는 소모되지 않는다');
  const allBlocked = R.cePickNext(list, 0, '2026-09-01', R.CE_ROLE.ALL, [], ['가', '나', '다']);
  assert.strictEqual(allBlocked.name, '');
  assert.strictEqual(allBlocked.ptr, 0);
});

test('현관안내 역할 이름 파싱', () => {
  assert.strictEqual(R.ceNormalizeRole('현관안내'), R.CE_ROLE.USHER);
  assert.strictEqual(R.ceNormalizeRole('안내'), R.CE_ROLE.USHER);
});

test('수요백업·토요백업 이름으로도 역할을 알아본다', () => {
  assert.strictEqual(R.ceNormalizeRole('수요백업'), R.CE_ROLE.DOOR);
  assert.strictEqual(R.ceNormalizeRole('토요백업'), R.CE_ROLE.PRAISE);
});

/* ---------- 계산 구간이 그 달에 휘둘리지 않는다 ---------- */

test('격자보다 한 달 더 계산할 구간을 함께 알려 준다', () => {
  assert.strictEqual(R.ceMonthGrid(2026, 9).buildEndIso, '2026-10-31');
  assert.strictEqual(R.ceMonthGrid(2026, 11).buildEndIso, '2026-12-31');
  assert.strictEqual(R.ceMonthGrid(2026, 12).buildEndIso, '2027-01-31');   // 해를 넘긴다
  assert.strictEqual(R.ceMonthGrid(2028, 1).buildEndIso, '2028-02-29');    // 윤년
});

test('마지막 주 겹침이 구간 밖 때문에 달마다 달라지지 않는다', () => {
  // 2027-07-02(금) 에 설교자=방송실 이 되고, 맞바꿀 상대는 7/5(월) 입니다.
  // 6월 격자는 7/3 에서 끝나므로, 격자까지만 계산하면 못 풀고 7월 시트와 어긋납니다.
  const cfg = { anchor: '2026-09-02', dawnDows: [1,2,3,4,5,6], satDows: [6], doorDows: [3], praiseDows: [6] };
  const rot = {
    sermon: ['김진혁','김혜성','이광현','백주은','이민희','최세영','김진혁',
      '김혜성','박소영','이광현','백주은','이민희','최세영'],
    broadcast: ['이광현','최세영','이민희','백주은','이다혜','김혜성','김진혁',
      '이광현','최세영','이민희','백주은','박소영','김혜성','김진혁'],
    satSermon: ['손창민'], satBroadcast: ['최세영'],
    door: ['이민희','백주은','박소영','김혜성','김진혁','이광현'],
    praise: ['백주은','김혜성','이광현','이민희']
  };
  const build = (y, m) => {
    const g = R.ceMonthGrid(y, m);
    return R.ceBuildSchedule(cfg, rot, [], g.buildEndIso);
  };
  const june = build(2027, 6).byIso['2027-07-02'];
  const july = build(2027, 7).byIso['2027-07-02'];
  assert.strictEqual(june.broadcast, july.broadcast, '6월 시트와 7월 시트의 7/2 방송실이 달라졌다');
  assert.strictEqual(june.warning, july.warning);
  assert.strictEqual(june.warning, '', '구간을 넉넉히 보면 풀려야 한다');
});

test('맞바꿀 상대는 2주 안에서만 찾는다', () => {
  assert.strictEqual(R.CE_SWAP_MAX_DAYS, 14);
  assert.strictEqual(R.ceDayGap('2026-09-01', '2026-09-15'), 14);
  assert.strictEqual(R.ceDayGap('2026-09-15', '2026-09-01'), -14);

  // 2주 넘게 떨어진 날은 상대가 되지 않는다
  const days = [
    { iso: '2026-09-01', dow: 2, preacher: '가', broadcast: '가', bcGroup: 'broadcast', swapGroup: 'week' },
    { iso: '2026-09-17', dow: 4, preacher: '나', broadcast: 'ㄴ', bcGroup: 'broadcast', swapGroup: 'week' }
  ];
  R.ceResolveConflicts(days, []);
  assert.strictEqual(days[0].broadcast, '가', '2주 밖은 데려오지 않는다');
  assert.ok(days[0].warning);
});

/* ---------- 같은 요일 설교는 한 달에 두 번까지 ---------- */

const DOW_CFG = {
  anchor: '2026-08-31', dawnDows: [1, 2, 3, 4, 5, 6],
  satDows: [6], doorDows: [3], praiseDows: [6]
};

/** 평일 한 칸 */
function wd(iso, dow, preacher, broadcast) {
  return { iso: iso, dow: dow, preacher: preacher, broadcast: broadcast || '',
    bcGroup: 'broadcast', swapGroup: 'week' };
}

test('두 번까지는 그대로 둔다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-08', 2, '나'),
    wd('2026-09-14', 1, '가'), wd('2026-09-15', 2, '다')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.deepStrictEqual(days.map(d => d.preacher), ['가', '나', '가', '다']);
  days.forEach(d => assert.strictEqual(d.dowNote, undefined));
});

test('같은 요일 세 번째는 다른 요일과 순서를 바꾼다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'),
    wd('2026-09-21', 1, '가'),          // 월요일 세 번째
    wd('2026-09-22', 2, '나')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[2].preacher, '나', '세 번째 월요일이 다른 사람으로 바뀐다');
  assert.strictEqual(days[3].preacher, '가');
  assert.ok(days[2].dowNote.indexOf('월요일 설교가 세 번째라') === 0, days[2].dowNote);
  assert.ok(days[3].dowNote.indexOf('2026-09-21') === 0, days[3].dowNote);
  assert.strictEqual(days[2].dowWarning, undefined);
});

test('같은 요일끼리는 바꾸지 않는다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'),
    wd('2026-09-21', 1, '가'), wd('2026-09-28', 1, '나')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[2].preacher, '가', '월요일끼리 바꿔도 뜻이 없다');
  assert.ok(days[2].dowWarning);
});

test('바꾸면 그 요일이 세 번이 되는 상대는 넘어간다', () => {
  // 화요일: 가·가·가·나·나 → '가' 의 세 번째 화요일(9/15)을 옮겨야 한다.
  // 9/16 의 '나' 는 이미 화요일 두 번이라, 화요일로 데려오면 세 번이 된다.
  const days = [
    wd('2026-09-01', 2, '가'), wd('2026-09-08', 2, '가'),
    wd('2026-09-15', 2, '가'),          // 화요일 세 번째
    wd('2026-09-16', 3, '나'),          // 데려오면 '나' 가 화요일 세 번 → 넘어간다
    wd('2026-09-17', 4, '다'),
    wd('2026-09-22', 2, '나'), wd('2026-09-29', 2, '나')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[2].preacher, '다', '목요일 사람을 데려온다');
  assert.strictEqual(days[4].preacher, '가');
  assert.strictEqual(days[3].preacher, '나', '화요일 두 번인 사람은 건드리지 않는다');
});

test('옮기는 쪽에도 이득이면 그대로 맞바꾼다', () => {
  // 월요일 '가' 세 번, 화요일 '나' 세 번 — 둘을 맞바꾸면 양쪽 다 두 번이 된다
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-08', 2, '나'),
    wd('2026-09-14', 1, '가'), wd('2026-09-15', 2, '나'),
    wd('2026-09-21', 1, '가'), wd('2026-09-22', 2, '나')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[4].preacher, '나');
  assert.strictEqual(days[5].preacher, '가');
  const count = {};
  days.forEach(d => {
    const k = d.dow + '/' + d.preacher;
    count[k] = (count[k] || 0) + 1;
    assert.ok(count[k] <= 2, k + ' 가 ' + count[k] + '번');
  });
});

test('옮겨 간 쪽이 그 요일 두 번을 넘겨도 안 된다', () => {
  const days = [
    wd('2026-09-02', 3, '가'), wd('2026-09-09', 3, '가'),   // '가' 는 이미 수요일 두 번
    wd('2026-09-07', 1, '나'), wd('2026-09-14', 1, '나'),
    wd('2026-09-21', 1, '나'),                               // 월요일 세 번째
    wd('2026-09-23', 3, '다')                                // 바꾸면 '나' 가 수요일로 - 괜찮다
  ];
  days.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  R.ceEnforceSameDowLimit(days, []);
  const at = iso => days.filter(d => d.iso === iso)[0].preacher;
  assert.strictEqual(at('2026-09-21'), '다');
  assert.strictEqual(at('2026-09-23'), '나');
  assert.strictEqual(at('2026-09-02'), '가', '수요일 두 번인 사람은 그대로');
});

test('그날 방송실과 겹치게 되는 상대는 넘어간다', () => {
  const days = [
    wd('2026-09-07', 1, '가', 'ㄱ'), wd('2026-09-14', 1, '가', 'ㄴ'),
    wd('2026-09-21', 1, '가', 'ㄷ'),
    wd('2026-09-22', 2, 'ㄷ', 'ㄹ'),    // 데려오면 9/21 설교자=방송실
    wd('2026-09-23', 3, '라', 'ㅁ')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[2].preacher, '라');
  assert.strictEqual(days[3].preacher, 'ㄷ', '겹치는 상대는 건드리지 않는다');
});

test('그날 휴가인 사람은 데려오지 않는다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'),
    wd('2026-09-21', 1, '가'), wd('2026-09-22', 2, '나'), wd('2026-09-23', 3, '다')
  ];
  const ex = [{ name: '나', start: '2026-09-21', end: '2026-09-21', role: R.CE_ROLE.ALL }];
  R.ceEnforceSameDowLimit(days, ex);
  assert.strictEqual(days[2].preacher, '다');
  assert.strictEqual(days[3].preacher, '나');
});

test('뒤가 막히면 앞쪽에서도 찾는다', () => {
  const days = [
    wd('2026-09-02', 3, '나'),          // 앞쪽 수요일
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'),
    wd('2026-09-28', 1, '가')           // 월요일 세 번째인데 뒤에 평일이 없다
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[3].preacher, '나');
  assert.strictEqual(days[0].preacher, '가');
});

test('달을 넘기면서까지 찾지는 않는다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'), wd('2026-09-28', 1, '가'),
    wd('2026-10-01', 4, '나')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.strictEqual(days[2].preacher, '가');
  assert.strictEqual(days[3].preacher, '나', '다음 달은 건드리지 않는다');
  assert.ok(days[2].dowWarning);
});

test('달이 바뀌면 횟수를 다시 센다', () => {
  const days = [
    wd('2026-09-07', 1, '가'), wd('2026-09-14', 1, '가'),
    wd('2026-10-05', 1, '가'), wd('2026-10-12', 1, '가')
  ];
  R.ceEnforceSameDowLimit(days, []);
  assert.deepStrictEqual(days.map(d => d.preacher), ['가', '가', '가', '가']);
  days.forEach(d => assert.strictEqual(d.dowNote, undefined));
});

test('토요일과 휴일은 이 규칙에서 뺀다', () => {
  const days = [
    satDay('2026-09-05', '강', '임'), satDay('2026-09-12', '강', '임'),
    satDay('2026-09-19', '강', '임'), satDay('2026-09-26', '강', '임'),
    { iso: '2026-09-07', dow: 1, preacher: '휴설', broadcast: '휴백', swapGroup: 'holiday' },
    { iso: '2026-09-14', dow: 1, preacher: '휴설', broadcast: '휴백', swapGroup: 'holiday' },
    { iso: '2026-09-21', dow: 1, preacher: '휴설', broadcast: '휴백', swapGroup: 'holiday' }
  ];
  R.ceEnforceSameDowLimit(days, []);
  days.forEach(d => {
    assert.strictEqual(d.dowNote, undefined, d.iso + ' 를 건드렸다');
    assert.strictEqual(d.dowWarning, undefined, d.iso + ' 에 경고를 남겼다');
  });
});

test('배정 전체에서 같은 요일 설교가 두 번을 넘지 않는다', () => {
  // 평일이 주 5칸이라 명단이 5명이면 매주 같은 요일에 같은 사람이 섭니다
  const rot = {
    sermon: ['설1', '설2', '설3', '설4', '설5'],
    broadcast: ['방1', '방2', '방3', '방4', '방5', '방6', '방7'],
    satSermon: ['토설'], satBroadcast: ['토방']
  };
  const g = R.ceMonthGrid(2026, 9);
  const s = R.ceBuildSchedule(DOW_CFG, rot, [], g.buildEndIso);
  const count = {};
  s.dawnDays.filter(d => d.iso.slice(0, 7) === '2026-09' && d.swapGroup === 'week')
    .forEach(d => {
      const k = d.dow + '/' + d.preacher;
      count[k] = (count[k] || 0) + 1;
      assert.ok(count[k] <= R.CE_SAME_DOW_MAX,
        R.CE_DOW_NAMES[d.dow] + '요일 ' + d.preacher + ' 가 ' + count[k] + '번');
    });
  assert.ok(s.dawnDays.some(d => d.dowNote), '바꾼 자리가 있어야 한다');
});

test('설교자와 방송실 겹침은 이 규칙 뒤에도 남지 않는다', () => {
  const rot = {
    sermon: ['가', '나', '다', '라', '마'],
    broadcast: ['가', '나', '다', '라', '마', '바', '사'],
    satSermon: ['강'], satBroadcast: ['임']
  };
  const g = R.ceMonthGrid(2026, 9);
  const s = R.ceBuildSchedule(DOW_CFG, rot, [], g.buildEndIso);
  s.dawnDays.forEach(d => {
    if (d.preacher && d.broadcast && d.preacher === d.broadcast) {
      assert.ok(d.warning, d.iso + ' 에서 겹치는데 경고가 없다');
    }
  });
});

console.log('\n' + passed + ' passed');
