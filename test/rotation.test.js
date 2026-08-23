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
  for (let i = 0; i < d.length; i++) {
    assert.notStrictEqual(d[i].preacher, d[i].broadcast, d[i].iso + ' 에서 아직 겹친다');
  }
  // 첫날은 다음날 방송실과 맞바뀐 모양이어야 한다
  assert.strictEqual(d[0].broadcast, '나');
  assert.strictEqual(d[1].broadcast, '가');
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

console.log('\n' + passed + ' passed');
