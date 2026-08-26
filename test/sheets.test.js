/* 시트에 붙는 코드를 껍데기 시트 위에서 한 번 끝까지 돌려 봅니다.
   node test/sheets.test.js  */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext } = require('./fakeSheets');

const FILES = ['Rotation.gs', 'Sheets.gs', 'Calendar.gs', 'Render.gs', 'Qt.gs', 'Setup.gs', 'Menu.gs'];

function load() {
  const made = makeContext();
  const { ss, globals } = made;
  const ctx = vm.createContext(globals);
  ctx.__dialogs = () => made.shownDialogs;
  FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  });
  return { ctx, ss };
}

/* vm 안에서 만들어진 배열·객체는 프로토타입이 달라 deepStrictEqual 이 걸립니다. */
const plain = v => JSON.parse(JSON.stringify(v));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e));
    process.exitCode = 1;
  }
}

/** 초기 설정 + 명단 입력까지 끝낸 시트를 만들어 돌려줍니다. */
function prepared(rotationColumns) {
  const { ctx, ss } = load();
  ctx.ceSetupAll();

  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '로테이션 시작일') settings._set(r, 2, '2026-08-31');
  }

  const rot = ss.getSheetByName('로테이션');
  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  Object.keys(rotationColumns).forEach(header => {
    const col = headers.indexOf(header) + 1;
    assert.ok(col > 0, '머리글을 못 찾음: ' + header);
    rotationColumns[header].forEach((name, i) => rot._set(2 + i, col, name));
  });
  return { ctx, ss };
}

/** 월별 시트에서 한 줄을 읽어 옵니다. base 는 그 주 블록의 Date 줄. */
function readRow(sheet, base, offset) {
  return sheet.getRange(base + offset, 2, 1, 6).getValues()[0].map(v => String(v));
}

test('초기 설정이 필요한 탭과 열을 모두 만든다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  ['설정', '로테이션', '달력(예외자)'].forEach(n => assert.ok(ss.getSheetByName(n), n + ' 탭이 없다'));
  const rot = ss.getSheetByName('로테이션');
  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  ['설교', '방송', '토요설교', '토요방송', '수요현관', '토요찬양']
    .forEach(h => assert.ok(headers.indexOf(h) >= 0, h + ' 열이 없다'));
});

test('설정 탭에 새 항목이 다 들어간다', () => {
  const { ctx } = load();
  ctx.ceSetupAll();
  const cfg = ctx.ceReadConfig();
  assert.deepStrictEqual(plain(cfg.dawnDows), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(plain(cfg.satDows), [6]);
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6]);
});

test('명단을 머리글 이름으로 읽는다 (열 순서를 바꿔도)', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  // 일부러 순서를 뒤집고 사이에 빈 열을 둡니다
  rot._set(1, 1, '토요찬양'); rot._set(2, 1, '서집사');
  rot._set(1, 3, '설교'); rot._set(2, 3, '김목사'); rot._set(3, 3, '이목사');
  rot._set(1, 4, '방송실'); rot._set(2, 4, '정집사');
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사', '이목사']);
  assert.deepStrictEqual(plain(read.broadcast), ['정집사']);
  assert.deepStrictEqual(plain(read.praise), ['서집사']);
  assert.deepStrictEqual(plain(read.satSermon), []);
});

test('예전 3열짜리 로테이션 탭에 빠진 열을 덧붙인다', () => {
  const { ctx, ss } = load();
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '수요현관'); rot._set(2, 3, '오권사');

  const added = ctx.ceUpgradeRotation();
  assert.deepStrictEqual(plain(added), ['토요설교', '토요방송', '토요찬양']);

  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), ['오권사'], '기존 수요현관이 다른 명단으로 잘못 읽히면 안 된다');
  assert.deepStrictEqual(plain(read.satSermon), []);
});

test('새 명단 열은 기존 명단 바로 옆에 들어간다 (안내 문구 뒤로 밀리지 않게)', () => {
  const { ctx, ss } = load();
  // 예전 버전이 만들던 모습 그대로: A~C 명단, E열에 안내 문구
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '수요현관'); rot._set(2, 3, '오권사');
  rot._set(1, 5, '2행부터 한 줄에 한 명씩, 설 순서대로 적으세요.');
  rot._set(2, 5, '위에서 아래로 돌아갑니다.');

  ctx.ceUpgradeRotation();

  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  assert.deepStrictEqual(plain(headers.slice(0, 6)),
    ['설교', '방송', '수요현관', '토요설교', '토요방송', '토요찬양']);
  // 안내 문구는 오른쪽으로 밀렸을 뿐 사라지지 않는다
  assert.ok(String(rot._get(1, 7)).indexOf('2행부터') === 0, '안내 문구가 보존되어야 한다');
  // 기존 이름도 그대로
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), ['오권사']);
});

test('토요 명단이 비어 있으면 평일 명단으로 돌았다고 알려 준다', () => {
  const { ctx } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('[토요설교]') >= 0, '토요설교 안내가 있어야 한다');
  assert.ok(joined.indexOf('[토요방송]') >= 0, '토요방송 안내가 있어야 한다');
  assert.ok(joined.indexOf('[토요찬양]') >= 0);
  assert.ok(joined.indexOf('[수요현관]') >= 0);
});

test('토요 명단을 채우면 그 안내는 사라진다', () => {
  const { ctx } = prepared({
    '설교': ['김목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceRenderCalendar(2026, 9);          // 달력을 배정할 달로 맞춰 둔다
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test("예전 '수요저녁 요일' 설정을 그대로 알아본다", () => {
  const { ctx, ss } = load();
  const set = ss.insertSheet('설정');
  set._set(1, 1, '항목'); set._set(1, 2, '값');
  set._set(2, 1, '로테이션 시작일'); set._set(2, 2, '2026-08-31');
  set._set(3, 1, '새벽예배 요일'); set._set(3, 2, '월,화,수,목,금,토');
  set._set(4, 1, '수요저녁 요일'); set._set(4, 2, '수');

  const cfg = ctx.ceReadConfig();
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6], '없는 항목은 기본값으로 채운다');

  const added = ctx.ceUpgradeSettings();
  assert.ok(added.indexOf('수요현관 요일') < 0, '예전 이름이 있으면 새 이름을 또 만들지 않는다');
  assert.ok(added.indexOf('토요찬양 요일') >= 0);
  assert.ok(added.indexOf('토요 별도 요일') >= 0);
});

test('월별 표를 끝까지 그린다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사', '박전도사'],
    '방송': ['정집사', '한집사'],
    '토요설교': ['강목사', '조전도사'],
    '토요방송': ['임집사', '류집사'],
    '수요현관': ['오권사', '윤집사'],
    '토요찬양': ['서집사', '표집사']
  });

  ctx.ceRenderCalendar(2026, 9);
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(out.sheetName, '2026-09');
  assert.deepStrictEqual(plain(out.warnings), []);

  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getRange(1, 1).getValue(), '2026년 9월 새벽 설교자 및 백업');
  assert.deepStrictEqual(plain(sh.getRange(2, 2, 1, 6).getValues()[0]), ['월', '화', '수', '목', '금', '토']);

  // 첫 주 블록: 3행 Date / 4행 설교자 / 5행 방송실 / 6행 수요·토요
  assert.strictEqual(sh.getRange(3, 1).getValue(), 'Date');
  assert.strictEqual(sh.getRange(6, 1).getValue(), '수요/토요');
  assert.deepStrictEqual(plain(readRow(sh, 3, 0)), ['31', '1', '2', '3', '4', '5']);

  const preachers = readRow(sh, 3, 1);
  assert.deepStrictEqual(plain(preachers.slice(0, 5)), ['김목사', '이목사', '박전도사', '김목사', '이목사']);
  assert.strictEqual(preachers[5], '강목사', '토요일은 토요설교 명단');

  const broadcast = readRow(sh, 3, 2);
  assert.strictEqual(broadcast[5], '임집사', '토요일은 토요방송 명단');

  const special = readRow(sh, 3, 3);
  assert.deepStrictEqual(plain(special), ['', '', '오권사', '', '', '서집사']);
});

test('마지막 주까지 다섯 블록이 다 그려진다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  // 5주 x 4줄, 3행부터 -> 마지막 블록의 Date 줄은 19행
  assert.deepStrictEqual(plain(readRow(sh, 19, 0)), ['28', '29', '30', '1', '2', '3']);
  assert.ok(String(sh.getRange(19 + 1, 2).getValue()).length > 0);
});

test('같은 달을 두 번 그려도 결과가 같다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사', '한집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const first = ss.getSheetByName('2026-09').getRange(3, 1, 20, 7).getValues();
  ctx.ceGenerateMonth(2026, 9);
  const second = ss.getSheetByName('2026-09').getRange(3, 1, 20, 7).getValues();
  assert.deepStrictEqual(plain(second), plain(first));
});

test('달력에 적은 휴가가 배정에 반영된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);

  // 9/1 은 화요일 -> 첫 주(8/30~9/5) 이름 줄에서 화요일 칸
  const cal = ss.getSheetByName('달력(예외자)');
  const dateRow = 4;
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(dateRow, c)) === '1') col = c;
  assert.ok(col > 0, '9/1 칸을 찾지 못함');
  cal._set(dateRow + 1, col, '이목사');

  const out = ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[0], '김목사');           // 8/31
  assert.strictEqual(preachers[1], '박전도사');         // 9/1 이목사 건너뜀
  assert.strictEqual(preachers[2], '김목사');           // 9/2
  assert.deepStrictEqual(plain(out.warnings), []);
});

test("달력에 '휴일' 을 적으면 그 날 칸이 비고 순번이 유지된다", () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);

  const cal = ss.getSheetByName('달력(예외자)');
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '휴일');

  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[0], '김목사');   // 8/31
  assert.strictEqual(preachers[1], '');         // 9/1 휴일
  assert.strictEqual(preachers[2], '이목사');   // 순번이 소모되지 않았다
  assert.strictEqual(sh.notes.get(`${4},${2 + 1}`), '휴일 — 직접 입력하세요');
});

/** 달력 격자에서 그 날짜가 들어 있는 이름 칸 좌표를 찾습니다. */
function findDayCell(cal, day) {
  for (let r = 4; r <= 20; r += 2) {
    for (let c = 1; c <= 7; c++) {
      if (String(cal._get(r, c)) === String(day)) return { row: r + 1, col: c };
    }
  }
  throw new Error(day + '일 칸을 찾지 못했습니다');
}

test('달을 옮겼다 돌아오면 적어 둔 내용이 그대로 있다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const sep1 = findDayCell(cal, 1);
  cal._set(sep1.row, sep1.col, '김목사');

  ctx.ceRenderCalendar(2026, 10);
  const oct1 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(oct1.row, oct1.col)), '', '적은 적 없는 달은 비어 있다');
  cal._set(oct1.row, oct1.col, '정집사');

  ctx.ceRenderCalendar(2026, 9);
  const back = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(back.row, back.col)), '김목사', '9월 내용이 돌아와야 한다');

  ctx.ceRenderCalendar(2026, 10);
  const back10 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(back10.row, back10.col)), '정집사', '10월 내용도 남아 있어야 한다');
});

test('역할을 적은 것도 그대로 돌아온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 2);
  cal._set(c1.row, c1.col, '김목사, 정집사(방송)');

  ctx.ceRenderCalendar(2026, 10);
  ctx.ceRenderCalendar(2026, 9);
  const back = findDayCell(cal, 2);
  assert.strictEqual(String(cal._get(back.row, back.col)), '김목사, 정집사(방송)');
});

test('다른 달을 보고 있어도 그 달 예외가 배정에 반영된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 1);
  cal._set(c1.row, c1.col, '이목사');

  ctx.ceRenderCalendar(2026, 10);          // 달력은 10월을 보고 있지만
  const out = ctx.ceGenerateMonth(2026, 9);  // 9월을 배정한다

  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[1], '박전도사', '9/1 이목사가 건너뛰어져야 한다');
  // 달력이 다른 달을 보고 있다는 이유로 경고하지 않는다
  assert.ok(out.notes.every(n => n.indexOf('보고 있습니다') < 0), out.notes.join(' / '));
});

test('달력 저장용 숨김 탭이 생기고 숨겨져 있다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const store = ss.getSheetByName('_달력저장');
  assert.ok(store, '저장 탭이 있어야 한다');
  assert.strictEqual(store.hidden, true);
  assert.deepStrictEqual(plain(ss.visibleNames()), ['달력(예외자)', '로테이션', '설정']);
});

test('명단이 비어 있으면 안내와 함께 멈춘다', () => {
  const { ctx } = load();
  ctx.ceSetupAll();
  assert.throws(() => ctx.ceGenerateMonth(2026, 9), /설교\] 명단이 비어 있습니다/);
});

test('기준일보다 앞선 달은 안내와 함께 멈춘다', () => {
  const { ctx } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  assert.throws(() => ctx.ceGenerateMonth(2026, 1), /로테이션 시작일/);
});


/* ---------- 머리글이 조금 달라도 알아보는지 ---------- */

test('머리글이 조금 달라도 명단을 알아본다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교자'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송실'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '토요 설교'); rot._set(2, 3, '강목사');
  rot._set(1, 4, '토요 방송실'); rot._set(2, 4, '임집사');
  rot._set(1, 5, '수요 현관'); rot._set(2, 5, '오권사');
  rot._set(1, 6, '토요 찬양'); rot._set(2, 6, '서집사');

  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.broadcast), ['정집사']);
  assert.deepStrictEqual(plain(read.satSermon), ['강목사']);
  assert.deepStrictEqual(plain(read.satBroadcast), ['임집사']);
  assert.deepStrictEqual(plain(read.door), ['오권사']);
  assert.deepStrictEqual(plain(read.praise), ['서집사']);
});

test('안내 문구는 머리글로 오인되지 않는다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  // '수' 나 '설' 이 들어간 긴 안내 문구
  rot._set(1, 2, '명단마다 인원 수는 서로 달라도 됩니다. 빈 칸은 알아서 건너뜁니다.');
  rot._set(2, 2, '위에서 아래로 돌아갑니다');
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), []);
  assert.deepStrictEqual(plain(read.broadcast), []);
});

test('열을 못 찾으면 비어 있는 것과 다르게 알려 준다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();

  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '로테이션 시작일') settings._set(r, 2, '2026-08-31');
  }

  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '토요설교');            // 열은 있는데 이름이 없음

  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('[토요설교] 열(C열)에 이름이 없습니다') >= 0, joined);
  assert.ok(joined.indexOf('[토요방송] 열을') >= 0 && joined.indexOf('찾지 못했습니다') >= 0, joined);
});


test("새벽예배 요일에 '토' 가 없으면 그 이유를 알려 준다", () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '새벽예배 요일') settings._set(r, 2, '월,화,수,목,금');
  }

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.ok(out.notes.join('\n').indexOf('[새벽예배 요일] 에 토요일이 없습니다') >= 0, out.notes.join('\n'));

  // 실제로 토요일 칸이 비어 있는지도 확인
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(String(sh.getRange(4, 7).getValue()), '', '토요일 설교자 칸');
  assert.strictEqual(String(sh.getRange(5, 7).getValue()), '', '토요일 방송실 칸');
  // 토요찬양은 새벽예배와 무관하므로 그대로 들어간다
  assert.strictEqual(String(sh.getRange(6, 7).getValue()), '서집사');
});


/* ---------- 탭 이름·순서, 누적 기록 ---------- */

test("예전 '달력' 탭은 '달력(예외자)' 로 이름이 바뀐다", () => {
  const { ctx, ss } = load();
  const old = ss.insertSheet('달력');
  old._set(1, 1, '연월');
  old._set(1, 2, '2026-09');

  const renamed = ctx.ceRenameLegacyTabs();
  assert.deepStrictEqual(plain(renamed), ['달력 → 달력(예외자)']);
  assert.ok(ss.getSheetByName('달력(예외자)'), '새 이름 탭이 있어야 한다');
  assert.strictEqual(ss.getSheetByName('달력'), null);
  assert.strictEqual(String(old._get(1, 2)), '2026-09', '내용은 그대로여야 한다');
});

test('탭 순서가 표 → 달력(예외자) → 로테이션 → 설정 이 된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-09', '달력(예외자)', '로테이션', '설정']);
});

test('달이 여러 개면 최근 달이 앞에, 방금 만든 달이 맨 앞에 온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  ctx.ceGenerateMonth(2026, 11);
  ctx.ceGenerateMonth(2026, 10);        // 마지막으로 만든 것이 맨 앞
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-10', '2026-11', '2026-09', '달력(예외자)', '로테이션', '설정']);
});

test('쓰지 않는 기록 탭을 만들지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(ss.getSheetByName('_기록'), null, '기록 탭은 더 이상 만들지 않는다');
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-09', '달력(예외자)', '로테이션', '설정']);
});


/* ---------- 달력 연월 드롭다운 ---------- */

test('달력 연월 목록은 이번 달이 맨 위, 앞뒤 6개월', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const rule = ss.getSheetByName('달력(예외자)').validations.get('1,2');
  assert.ok(rule, 'B1 에 목록이 있어야 한다');
  assert.strictEqual(rule.values.length, 13, '이번 달 + 다음 6 + 지난 6');
  assert.ok(rule.values.every(v => /^\d{4}-\d{2}$/.test(v)), rule.values.slice(0, 3).join(','));

  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const at = off => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + off, 1));
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`;
  };
  assert.strictEqual(rule.values[0], at(0), '맨 위가 이번 달');
  assert.strictEqual(rule.values[1], at(1), '그 다음이 다음 달');
  assert.strictEqual(rule.values[6], at(6));
  assert.strictEqual(rule.values[7], at(-1), '다음 달들 뒤에 지난 달');
  assert.strictEqual(rule.values[12], at(-6));
});

test('달력을 다시 그리지 않아도 시트를 열면 목록이 걸린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  const cal = ss.getSheetByName('달력(예외자)');
  cal.validations.clear();
  ctx.ceEnsureCalendarDropdown();
  const rule = cal.validations.get('1,2');
  assert.ok(rule);
  assert.strictEqual(rule.values.length, 13);
});

test('달력 탭이 없으면 목록 걸기를 조용히 넘어간다', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.ceEnsureCalendarDropdown(), false);
});

test('B1 을 바꾸면 그 달 달력이 그려지고, 보던 달 내용은 저장된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const sep1 = findDayCell(cal, 1);
  cal._set(sep1.row, sep1.col, '김목사');

  // 드롭다운에서 10월을 고른 상황: B1 이 먼저 바뀌고 onEdit 이 뒤따른다
  cal._set(1, 2, '2026-10');
  ctx.onEdit({ range: cal.getRange(1, 2) });

  assert.deepStrictEqual(plain(ctx.ceStoreGetShownMonth()), { year: 2026, month: 10 });
  const oct1 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(oct1.row, oct1.col)), '', '10월은 비어 있어야 한다');

  // 저장된 9월 내용이 9/1 로 들어갔는지 (10/1 로 잘못 들어가면 안 된다)
  const stored = plain(ctx.ceReadStoredExceptions());
  assert.deepStrictEqual(stored, [{ name: '김목사', start: '2026-09-01', end: '2026-09-01', role: 'ALL' }]);
});

test('달력 아닌 칸을 고쳐도 onEdit 이 아무 일도 하지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '김목사');

  ctx.onEdit({ range: cal.getRange(5, col) });          // 이름 칸을 고친 경우
  assert.strictEqual(String(cal._get(5, col)), '김목사', '달력이 다시 그려지면 안 된다');

  const rot = ss.getSheetByName('로테이션');
  ctx.onEdit({ range: rot.getRange(1, 2) });            // 다른 탭
  assert.deepStrictEqual(plain(ctx.ceCalendarYearMonth()), { year: 2026, month: 9 });
});

test('B1 에 알아볼 수 없는 값을 넣으면 달력을 건드리지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const snapshot = () => cal.getRange(3, 1, 14, 7).getValues().map(r => r.map(String));
  const before = plain(snapshot());

  cal._set(1, 2, '아무거나');
  ctx.onEdit({ range: cal.getRange(1, 2) });

  assert.deepStrictEqual(plain(snapshot()), before, '격자가 그대로여야 한다');
});


/* ---------- 명단에 없는 이름(오타) 알림 ---------- */

test('달력에 명단에 없는 이름이 있으면 배정 안내로 알려 준다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '김목사님');          // 명단에는 '김목사'

  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('김목사님') >= 0, joined);
  assert.ok(joined.indexOf('명단에 없는 이름') >= 0, joined);
});

test('이름이 맞으면 아무 말도 하지 않는다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '김목사');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test("'휴일' 은 명단에 없어도 알리지 않는다", () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '휴일');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test('다른 달에 적힌 오타는 이번 달 배정에서 알리지 않는다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceRenderCalendar(2026, 11);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 10);
  cal._set(c.row, c.col, '없는사람');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), [], out.notes.join(' / '));
});


/* ---------- 이름 체크박스로 강조하기 ---------- */

function pickerRows(sh, lastTableRow) {
  // 표 아래 안내줄 다음부터 이름/체크박스 줄이 짝으로 이어집니다.
  return { label: lastTableRow + 2, firstName: lastTableRow + 3, firstCheck: lastTableRow + 4 };
}

test('표 아래에 이름과 체크박스가 깔린다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사', '한집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요현관': ['오권사'], '토요찬양': ['서집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const lastTableRow = 3 + 5 * 4 - 1;          // 5주 x 4줄
  const p = pickerRows(sh, lastTableRow);
  assert.ok(String(sh.getRange(p.label, 1).getValue()).indexOf('노랗게') >= 0,
    String(sh.getRange(p.label, 1).getValue()));

  // 이름 줄에 표에 나온 사람들이 있어야 한다
  const shown = [];
  for (let r = p.firstName; r <= p.firstName + 6; r += 2) {
    for (let c = 2; c <= 7; c++) {
      const v = String(sh._get(r, c)).trim();
      if (v && v !== 'false' && v !== 'true') shown.push(v);
    }
  }
  ['김목사', '이목사', '정집사', '한집사', '강목사', '임집사', '오권사', '서집사']
    .forEach(n => assert.ok(shown.indexOf(n) >= 0, n + ' 이 목록에 없다'));

  // 이름 바로 아래 칸은 체크박스여야 한다
  assert.ok(sh.checkboxes.has(`${p.firstCheck},2`), '첫 이름 아래에 체크박스가 있어야 한다');
});

test('이름은 가나다 순이고 중복이 없다', () => {
  const { ctx, ss } = prepared({
    '설교': ['한목사', '김목사'], '방송': ['김목사', '박집사']   // 김목사가 두 명단에 있음
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const p = pickerRows(sh, 3 + 5 * 4 - 1);

  const shown = [];
  for (let c = 2; c <= 7; c++) {
    const v = String(sh._get(p.firstName, c)).trim();
    if (v) shown.push(v);
  }
  assert.deepStrictEqual(plain(shown), ['김목사', '박집사', '한목사']);
});

test('체크한 이름 칸을 노랗게 칠하는 규칙이 걸린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const rules = sh.getConditionalFormatRules();
  assert.strictEqual(rules.length, 1, '규칙이 하나 걸려야 한다');
  assert.strictEqual(rules[0].background, '#ffe599');
  assert.ok(rules[0].formula.indexOf('COUNTIFS') >= 0, rules[0].formula);
  assert.ok(rules[0].formula.indexOf('TRUE') >= 0, rules[0].formula);
  assert.strictEqual(rules[0].ranges[0], 'B2:G26', '표부터 이름 목록까지만 잡아야 한다');
});

test('사람이 많으면 여러 줄로 나뉘고 규칙이 그만큼 이어붙는다', () => {
  const { ctx, ss } = prepared({
    '설교': ['가목사', '나목사', '다목사', '라목사'],
    '방송': ['마집사', '바집사', '사집사'],
    '수요현관': ['아권사'], '토요찬양': ['자집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const rules = sh.getConditionalFormatRules();
  const terms = rules[0].formula.split('COUNTIFS').length - 1;
  assert.strictEqual(terms, 2, '9명이면 6+3 두 줄이므로 항이 둘이어야 한다');
});

test('다시 만들면 규칙이 겹쳐 쌓이지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getConditionalFormatRules().length, 1);
});

test('아래 설명줄은 이름 목록보다 뒤에 온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  let footRow = 0;
  for (let r = 20; r <= 40; r++) {
    if (String(sh._get(r, 1)).indexOf('자동 생성') === 0) footRow = r;
  }
  assert.ok(footRow > 0, '설명줄을 찾지 못했다');
  const p = pickerRows(sh, 3 + 5 * 4 - 1);
  assert.ok(footRow > p.firstCheck, '설명줄이 이름 목록 아래여야 한다');
});


/* ---------- 생명의 삶 묵상달력 링크 ---------- */

/** 배정표에서 묵상달력 링크가 있는 줄을 찾습니다. */
function findQtRow(sh) {
  for (let r = 1; r <= 60; r++) {
    if (String(sh._get(r, 1)).indexOf('생명의 삶 묵상달력 열기') === 0) return r;
  }
  return 0;
}

test('배정표 아래에 묵상달력 줄과 체크박스가 들어간다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const row = findQtRow(sh);
  assert.ok(row > 0, '묵상달력 줄을 찾지 못했다');
  assert.ok(sh.checkboxes.has(`${row},7`), '맨 오른쪽(G열)에 체크박스가 있어야 한다');
  assert.ok(!sh.checkboxes.has(`${row},1`), 'A열에는 없어야 한다');
});

test('체크박스를 누르면 창이 뜨고 체크는 다시 풀린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const row = findQtRow(sh);

  sh._set(row, 7, true);
  ctx.ceOnQtCheckbox({ range: sh.getRange(row, 7) });

  const dialogs = ctx.__dialogs();
  assert.strictEqual(dialogs.length, 1, '창이 한 번 떠야 한다');
  assert.ok(dialogs[0].html.indexOf('duranno.com/qt/view/calendar.asp') > 0, dialogs[0].html);
  assert.strictEqual(dialogs[0].title.indexOf('생명의 삶'), 0, dialogs[0].title);
  assert.strictEqual(sh._get(row, 7), false, '체크가 풀려 있어야 다시 누를 수 있다');
});

test('체크를 푸는 편집이나 다른 칸에는 반응하지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const row = findQtRow(sh);

  sh._set(row, 7, false);
  ctx.ceOnQtCheckbox({ range: sh.getRange(row, 7) });     // 체크를 푸는 경우
  ctx.ceOnQtCheckbox({ range: sh.getRange(4, 3) });        // 표 한가운데
  ctx.ceOnQtCheckbox({ range: ss.getSheetByName('로테이션').getRange(1, 1) });

  assert.strictEqual(ctx.__dialogs().length, 0);
});

test('이름 체크박스를 눌러도 묵상달력 창이 뜨지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const nameCheckRow = 3 + 5 * 4 - 1 + 4;      // 이름 줄 바로 아래 체크 줄
  sh._set(nameCheckRow, 7, true);              // 같은 G열이라도
  ctx.ceOnQtCheckbox({ range: sh.getRange(nameCheckRow, 7) });
  assert.strictEqual(ctx.__dialogs().length, 0, '그 줄 왼쪽에 묵상달력 글이 없으면 걸리지 않는다');
});

test('초기 설정이 묵상달력 트리거를 걸고, 두 번 걸지 않는다', () => {
  const { ctx } = load();
  const first = ctx.ceSetupAll();
  assert.strictEqual(first.trigger, true);
  const second = ctx.ceSetupAll();
  assert.strictEqual(second.trigger, false, '이미 있으면 다시 만들지 않는다');
});

test("예전 '생명의 삶' 탭은 지운다", () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const old = ss.insertSheet('생명의 삶');
  old._set(1, 1, '생명의 삶 · 묵상 달력');

  ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(ss.getSheetByName('생명의 삶'), null);
});

test('내가 쓰던 다른 내용이 든 같은 이름 탭은 건드리지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const mine = ss.insertSheet('생명의 삶');
  mine._set(1, 1, '내가 적어 둔 것');

  ctx.ceGenerateMonth(2026, 9);
  assert.ok(ss.getSheetByName('생명의 삶'), '남의 내용은 지우면 안 된다');
  assert.strictEqual(String(mine._get(1, 1)), '내가 적어 둔 것');
});

test('배정표에 아이디나 비밀번호가 들어가지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const dump = ss.getSheetByName('2026-09').getRange(1, 1, 60, 7).getValues().join(' ').toLowerCase();
  ['churcheveryday', 'media1234'].forEach(secret => {
    assert.ok(dump.indexOf(secret) < 0, secret + ' 이 배정표에 들어가 있다');
  });
});

console.log('\n' + passed + ' passed');
