/* 시트에 붙는 코드를 껍데기 시트 위에서 한 번 끝까지 돌려 봅니다.
   node test/sheets.test.js  */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext } = require('./fakeSheets');

const FILES = ['Rotation.gs', 'Sheets.gs', 'Calendar.gs', 'Render.gs', 'Setup.gs', 'Menu.gs'];

function load() {
  const { ss, globals } = makeContext();
  const ctx = vm.createContext(globals);
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

test('달력을 다시 그리면 날짜만 나오고 이름 칸은 빈다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);

  const cal = ss.getSheetByName('달력(예외자)');
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '김목사');
  assert.strictEqual(String(cal._get(5, col)), '김목사');

  ctx.ceRenderCalendar(2026, 10);
  // 10월 격자: 날짜는 나오고
  let has = false;
  for (let r = 4; r <= 16; r += 2) for (let c = 1; c <= 7; c++) if (String(cal._get(r, c)) === '1') has = true;
  assert.ok(has, '날짜는 그려져야 한다');
  // 이름 줄은 전부 비어 있어야 한다
  for (let r = 5; r <= 17; r += 2) {
    for (let c = 1; c <= 7; c++) {
      assert.strictEqual(String(cal._get(r, c)), '', `${r}행 ${c}열이 비어 있어야 한다`);
    }
  }

  ctx.ceRenderCalendar(2026, 9);   // 9월로 돌아와도 되살아나지 않는다
  let back = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') back = c;
  assert.strictEqual(String(cal._get(5, back)), '');
});

test('달력 저장용 숨김 탭을 만들지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  ctx.ceRenderCalendar(2026, 10);
  ctx.ceGenerateMonth(2026, 10);
  assert.strictEqual(ss.getSheetByName('_달력저장'), null);
  assert.deepStrictEqual(plain(ss.sheets.filter(s => s.hidden).map(s => s.name)), []);
});

test('달력이 다른 달을 보고 있으면 알려 준다', () => {
  const { ctx } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 10);
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.ok(out.notes.join('\n').indexOf('2026-10 을 보고 있습니다') >= 0, out.notes.join('\n'));
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
  assert.deepStrictEqual(plain(ss.visibleNames()), ['2026-09', '달력(예외자)', '로테이션', '설정']);
});


/* ---------- 달력 연월 드롭다운 ---------- */

test('달력 연월 칸(B1)에 오늘 기준 앞뒤 12개월이 붙는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const rule = cal.validations.get('1,2');
  assert.ok(rule, 'B1 에 목록이 있어야 한다');
  assert.strictEqual(rule.values.length, 25, '앞 12 + 이번 달 + 뒤 12');
  assert.ok(rule.values.every(v => /^\d{4}-\d{2}$/.test(v)), rule.values.slice(0, 3).join(','));

  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const thisMonth = `${now.getFullYear()}-${p(now.getMonth() + 1)}`;
  assert.strictEqual(rule.values[12], thisMonth, '가운데가 이번 달이어야 한다');
});

test('달력을 다시 그리지 않아도 시트를 열면 목록이 걸린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  const cal = ss.getSheetByName('달력(예외자)');
  cal.validations.clear();                       // 예전 버전으로 만들어져 목록이 없던 상태
  assert.strictEqual(cal.validations.get('1,2'), undefined);

  ctx.ceEnsureCalendarDropdown();                // onOpen 이 하는 일
  const rule = cal.validations.get('1,2');
  assert.ok(rule, '목록이 걸려야 한다');
  assert.strictEqual(rule.values.length, 25);
});

test('달력 탭이 없으면 목록 걸기를 조용히 넘어간다', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.ceEnsureCalendarDropdown(), false);
});

test('B1 을 바꾸면 그 달 달력이 그려진다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  // 9월 달력에 이름을 적어 두고
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '김목사');

  // B1 을 10월로 바꾼 뒤 onEdit 이 도는 상황
  cal._set(1, 2, '2026-10');
  ctx.onEdit({ range: cal.getRange(1, 2) });

  assert.deepStrictEqual(plain(ctx.ceCalendarYearMonth()), { year: 2026, month: 10 });
  // 10월 1일은 목요일이므로 첫 주 목요일 칸에 1 이 있어야 한다
  let found = false;
  for (let r = 4; r <= 16; r += 2) for (let c = 1; c <= 7; c++) if (String(cal._get(r, c)) === '1') found = true;
  assert.ok(found, '10월 날짜가 그려져야 한다');
  // 이름 칸은 비어 있다
  for (let r = 5; r <= 17; r += 2) {
    for (let c = 1; c <= 7; c++) assert.strictEqual(String(cal._get(r, c)), '');
  }
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

console.log('\n' + passed + ' passed');
