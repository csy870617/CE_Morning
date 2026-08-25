/* 달력 탭의 순수 로직 테스트:  node test/calendar.test.js
   시트 API 는 흉내만 낸 껍데기를 넣고 파일을 통째로 평가합니다. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({
  console,
  SpreadsheetApp: { newDataValidation: () => ({}), BorderStyle: { SOLID: 'SOLID' } },
  Utilities: { formatDate: () => '' }
});

['Rotation.gs', 'Sheets.gs', 'Calendar.gs'].forEach(f => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
});

/* vm 안에서 만들어진 객체는 프로토타입이 달라서 deepStrictEqual 이 걸립니다.
   비교 전에 평범한 객체로 옮겨 놓습니다. */
const plain = v => JSON.parse(JSON.stringify(v));

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

test('달력은 일요일에 시작해 토요일에 끝난다', () => {
  const weeks = ctx.ceCalendarWeeks(2026, 9);
  assert.strictEqual(weeks[0][0].iso, '2026-08-30');
  assert.strictEqual(weeks[0].length, 7);
  const last = weeks[weeks.length - 1];
  assert.strictEqual(last[6].iso, '2026-10-03');
  const inMonth = weeks.flat().filter(c => c.inMonth);
  assert.strictEqual(inMonth.length, 30);
});

test('이름 칸: 쉼표로 여러 명', () => {
  const out = plain(ctx.ceParseNameCell('홍길동, 김집사'));
  assert.deepStrictEqual(out, [
    { name: '홍길동', role: ctx.CE_ROLE.ALL },
    { name: '김집사', role: ctx.CE_ROLE.ALL }
  ]);
});

test('이름 칸: 괄호로 역할 지정', () => {
  const out = plain(ctx.ceParseNameCell('김집사(방송), 이집사(수요현관), 박목사(설교)'));
  assert.deepStrictEqual(out.map(e => e.role),
    [ctx.CE_ROLE.BROADCAST, ctx.CE_ROLE.DOOR, ctx.CE_ROLE.SERMON]);
  assert.deepStrictEqual(out.map(e => e.name), ['김집사', '이집사', '박목사']);
});

test('이름 칸: 줄바꿈과 전각 괄호도 받는다', () => {
  const out = plain(ctx.ceParseNameCell('홍길동\n김집사（방송）'));
  assert.deepStrictEqual(out.map(e => e.name), ['홍길동', '김집사']);
  assert.strictEqual(out[1].role, ctx.CE_ROLE.BROADCAST);
});

test('이름 칸: 비어 있으면 빈 배열', () => {
  assert.deepStrictEqual(plain(ctx.ceParseNameCell('')), []);
  assert.deepStrictEqual(plain(ctx.ceParseNameCell('   ')), []);
  assert.deepStrictEqual(plain(ctx.ceParseNameCell(null)), []);
});

test('이름 칸에 여러 명을 적으면 전부 읽힌다', () => {
  const out = plain(ctx.ceParseNameCell('이목사, 박전도사, 최목사(방송)'));
  assert.deepStrictEqual(out.map(e => e.name), ['이목사', '박전도사', '최목사']);
  assert.deepStrictEqual(out.map(e => e.role),
    [ctx.CE_ROLE.ALL, ctx.CE_ROLE.ALL, ctx.CE_ROLE.BROADCAST]);
});

test("이름 칸에 '휴일' 을 적으면 휴일로 읽힌다", () => {
  const out = plain(ctx.ceParseNameCell('휴일'));
  assert.deepStrictEqual(out, [{ name: '휴일', role: ctx.CE_ROLE.ALL }]);
  assert.strictEqual(ctx.ceIsHoliday('2026-09-01', ctx.CE_ROLE.SERMON,
    [{ name: out[0].name, start: '2026-09-01', end: '2026-09-01', role: out[0].role }]), true);
});

test("'휴일(방송)' 은 방송 역할로 읽힌다", () => {
  const out = plain(ctx.ceParseNameCell('휴일(방송)'));
  assert.deepStrictEqual(out, [{ name: '휴일', role: ctx.CE_ROLE.BROADCAST }]);
});

test("'휴일' 과 사람 이름을 같이 적어도 각각 읽힌다", () => {
  const out = plain(ctx.ceParseNameCell('휴일(방송), 홍길동'));
  assert.deepStrictEqual(out.map(e => e.name), ['휴일', '홍길동']);
  assert.strictEqual(ctx.ceIsHolidayName(out[0].name), true);
  assert.strictEqual(ctx.ceIsHolidayName(out[1].name), false);
});

test('연월 파싱', () => {
  assert.deepStrictEqual(plain(ctx.ceParseYearMonth('2026-09')), { year: 2026, month: 9 });
  assert.deepStrictEqual(plain(ctx.ceParseYearMonth('2026년 9월')), { year: 2026, month: 9 });
  assert.deepStrictEqual(plain(ctx.ceParseYearMonth('2026/9')), { year: 2026, month: 9 });
  assert.strictEqual(ctx.ceParseYearMonth('2026-13'), null);
  assert.strictEqual(ctx.ceParseYearMonth('아무거나'), null);
});

console.log('\n' + passed + ' passed');
