/*
 * 전체 점검기.  node tools/audit.js  (npm run audit)
 *
 * 테스트(test/*.js)가 '정해 둔 경우' 를 확인하는 것이라면,
 * 이 점검기는 '어떤 경우에도 깨지면 안 되는 규칙' 을 여러 설정 x 여러 달에 걸쳐
 * 되풀이 확인합니다. 무작위 조합(fuzz)도 함께 돌립니다.
 *
 * 확인하는 규칙
 *   1  격자는 주마다 월~토 6칸
 *   2  같은 날 설교자=방송실 이면 반드시 경고가 있다
 *   3  방송실 교대는 같은 요일 묶음(평일·토요) 안에서만 일어난다
 *   4  같은 사람이 그 달 같은 요일 설교·방송실에 두 번까지 (못 풀면 경고)
 *   5  현관안내는 그 주 수요백업·토요백업과 겹치지 않고, 주 안에 중복이 없다
 *   6  예외자(휴가)는 그 역할에 배정되지 않는다
 *   7  휴일은 휴일 명단에서만 채운다 (명단이 비면 빈칸)
 *   8  배정된 이름은 반드시 그 명단 안의 이름
 *   9  새벽예배 요일이 아닌 날에는 배정이 없다
 *  10  같은 달을 두 번 계산하면 결과가 같다
 *  11  앞뒤 달 시트가 겹치는 날짜에서 같은 이름을 쓴다
 */
const R = require('../src/Rotation.gs');

let fails = 0, groups = 0;
const bad = m => { fails++; console.log('  ✗ ' + m); };
const done = () => { groups++; };

function monthsFrom(y, m, n) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const ym = (y, m) => y + '-' + String(m).padStart(2, '0');

/** 월별 시트를 만들 때와 똑같이 계산합니다 (격자보다 한 달 더). */
function build(cfg, rot, ex, y, m) {
  const g = R.ceMonthGrid(y, m);
  return { g, s: R.ceBuildSchedule(cfg, rot, ex, g.buildEndIso) };
}

function audit(label, cfg, rot, ex, y, m) {
  const { g, s } = build(cfg, rot, ex, y, m);
  const tag = label + ' ' + ym(y, m);

  g.weeks.forEach((wk, i) => {
    if (wk.length !== 6) bad(tag + ' 주 ' + i + ' 가 ' + wk.length + '칸');
    wk.forEach((c, j) => {
      if (c.dow !== j + 1) bad(tag + ' ' + c.iso + ' 요일 자리가 어긋남');
    });
  });

  const byIso = {};
  s.dawnDays.forEach(d => { byIso[d.iso] = d; });

  s.dawnDays.forEach(d => {
    if (d.preacher && d.broadcast && d.preacher === d.broadcast && !d.warning) {
      bad(tag + ' ' + d.iso + ' 설교자=방송실(' + d.preacher + ') 인데 경고가 없다');
    }
    if (d.swapNote) {
      const p = byIso[d.swapNote.split(' ')[0]];
      if (p && p.swapGroup !== d.swapGroup) bad(tag + ' ' + d.iso + ' 교대 상대의 요일 묶음이 다르다');
    }
    const dawn = cfg.dawnDows.indexOf(R.ceParseIso(d.iso).getUTCDay()) >= 0;
    if (!dawn && (d.preacher || d.broadcast)) bad(tag + ' ' + d.iso + ' 는 새벽예배 요일이 아닌데 배정됐다');
  });

  const dow = { preacher: {}, broadcast: {} };
  const warnOf = { preacher: 'dowWarnSermon', broadcast: 'dowWarnBroadcast' };
  s.dawnDays.filter(d => d.swapGroup === 'week').forEach(d => {
    ['preacher', 'broadcast'].forEach(f => {
      if (!d[f]) return;
      const k = d.iso.slice(0, 7) + '/' + d.dow + '/' + d[f];
      dow[f][k] = (dow[f][k] || 0) + 1;
      if (dow[f][k] > R.CE_SAME_DOW_MAX && !d[warnOf[f]]) {
        bad(tag + ' ' + d.iso + ' ' + f + ' ' + d[f] + ' 가 그 요일에 ' +
          dow[f][k] + '번인데 경고가 없다');
      }
    });
  });

  s.usherWeeks.forEach(w => {
    const wk = R.ceWeekStart(w.iso);
    const busy = [];
    s.doorDays.forEach(d => { if (R.ceWeekStart(d.iso) === wk && d.door) busy.push(d.door); });
    s.praiseDays.forEach(d => { if (R.ceWeekStart(d.iso) === wk && d.praise) busy.push(d.praise); });
    w.ushers.forEach(n => {
      if (busy.indexOf(n) >= 0) bad(tag + ' ' + w.iso + ' 현관안내 ' + n + ' 가 그 주 백업과 겹친다');
    });
    if (w.ushers.filter((v, i, a) => a.indexOf(v) === i).length !== w.ushers.length) {
      bad(tag + ' ' + w.iso + ' 현관안내에 같은 사람이 두 번: ' + w.ushers.join(','));
    }
    if (w.ushers.length > R.CE_USHER_PER_WEEK) bad(tag + ' ' + w.iso + ' 현관안내 ' + w.ushers.length + '명');
  });

  ex.forEach(e => {
    if (R.ceIsHolidayName(e.name)) return;
    const pairs = [[R.CE_ROLE.SERMON, 'preacher', '설교'], [R.CE_ROLE.BROADCAST, 'broadcast', '방송'],
      [R.CE_ROLE.DOOR, 'door', '수요백업'], [R.CE_ROLE.PRAISE, 'praise', '토요백업']];
    for (const iso in s.byIso) {
      if (iso < e.start || iso > e.end) continue;
      pairs.forEach(([role, field, name]) => {
        if ((e.role === R.CE_ROLE.ALL || e.role === role) && s.byIso[iso][field] === e.name) {
          bad(tag + ' ' + iso + ' 예외자 ' + e.name + ' 가 ' + name + ' 에 들어갔다');
        }
      });
    }
  });

  s.dawnDays.forEach(d => {
    [['offSermon', 'preacher', 'holidaySermon'], ['offBroadcast', 'broadcast', 'holidayBroadcast']]
      .forEach(([off, field, key]) => {
        if (!d[off]) return;
        const list = rot[key] || [];
        if (!list.length) {
          if (d[field]) bad(tag + ' ' + d.iso + ' 휴일인데 ' + field + ' 에 ' + d[field]);
        } else if (d[field] && list.indexOf(d[field]) < 0) {
          bad(tag + ' ' + d.iso + ' 휴일 ' + field + ' 이 휴일 명단 밖: ' + d[field]);
        }
      });
  });

  const pool = k => rot[k] || [];
  s.dawnDays.forEach(d => {
    if (d.offSermon || d.offBroadcast) return;
    const both = pool(d.smGroup).concat(pool(d.bcGroup));
    if (d.preacher && both.indexOf(d.preacher) < 0) bad(tag + ' ' + d.iso + ' 설교자 ' + d.preacher + ' 가 명단 밖');
    if (d.broadcast && both.indexOf(d.broadcast) < 0) bad(tag + ' ' + d.iso + ' 방송실 ' + d.broadcast + ' 가 명단 밖');
  });
  s.doorDays.forEach(d => { if (d.door && pool('door').indexOf(d.door) < 0) bad(tag + ' ' + d.iso + ' 수요백업 명단 밖'); });
  s.praiseDays.forEach(d => { if (d.praise && pool('praise').indexOf(d.praise) < 0) bad(tag + ' ' + d.iso + ' 토요백업 명단 밖'); });
  s.usherWeeks.forEach(w => w.ushers.forEach(n => {
    if (pool('usher').indexOf(n) < 0) bad(tag + ' ' + w.iso + ' 현관안내 ' + n + ' 가 명단 밖');
  }));

  done();
}

/** 같은 달을 두 번, 그리고 달마다 따로 계산해도 겹치는 날이 같은지 */
function auditStability(label, cfg, rot, ex, months) {
  const seen = {};
  months.forEach(([y, m]) => {
    const { g, s } = build(cfg, rot, ex, y, m);
    const again = build(cfg, rot, ex, y, m).s;
    if (JSON.stringify(s.byIso) !== JSON.stringify(again.byIso)) {
      bad(label + ' ' + ym(y, m) + ' 를 두 번 계산하면 결과가 다르다');
    }
    const keep = (k, v) => {
      if (seen[k] && seen[k].v !== v) {
        bad(label + ' ' + k + ' 가 ' + seen[k].m + ' 와 ' + ym(y, m) + ' 에서 다르다\n' +
          '      ' + seen[k].m + ': ' + seen[k].v + '\n      ' + ym(y, m) + ': ' + v);
      }
      seen[k] = { m: ym(y, m), v: v };
    };
    for (const iso in s.byIso) {
      if (iso < g.startIso || iso > g.endIso) continue;      // 그 시트에 그려지는 날만
      const a = s.byIso[iso];
      keep(iso, [a.preacher, a.broadcast, a.door, a.praise].join('|'));
    }
    s.usherWeeks.filter(w => w.iso >= g.startIso && w.iso <= g.endIso)
      .forEach(w => keep('현관안내 ' + w.iso, w.ushers.join(',')));
  });
  done();
}

/* ---------- 손으로 고른 설정들 ---------- */

const BASE = { anchor: '2026-09-02', dawnDows: [1,2,3,4,5,6], satDows: [6], doorDows: [3], praiseDows: [6] };
const REAL = {
  sermon: ['김진혁','김혜성','이광현','백주은','이민희','최세영','김진혁','김혜성','박소영','이광현','백주은','이민희','최세영'],
  broadcast: ['이광현','최세영','이민희','백주은','이다혜','김혜성','김진혁','이광현','최세영','이민희','백주은','박소영','김혜성','김진혁'],
  satSermon: ['손창민'], satBroadcast: ['최세영'],
  door: ['이민희','백주은','박소영','김혜성','김진혁','이광현'],
  praise: ['백주은','김혜성','이광현','이민희'],
  holidaySermon: ['한목사','차목사'], holidayBroadcast: ['노집사'],
  usher: ['백주은','이광현','Janet Park','이민희','박소영','김혜성','김진혁']
};
const ONE = { sermon:['가'], broadcast:['가'], satSermon:['가'], satBroadcast:['가'],
  door:['가'], praise:['가'], holidaySermon:['가'], holidayBroadcast:['가'], usher:['가'] };

const CASES = [
  ['실제명단', BASE, REAL, []],
  ['휴가다수', BASE, REAL, [
    { name:'이민희', start:'2026-11-03', end:'2026-11-03', role:R.CE_ROLE.ALL },
    { name:'김혜성', start:'2026-11-09', end:'2026-11-13', role:R.CE_ROLE.ALL },
    { name:'이광현', start:'2026-11-23', end:'2026-11-27', role:R.CE_ROLE.BROADCAST },
    { name:'백주은', start:'2026-11-04', end:'2026-11-04', role:R.CE_ROLE.DOOR }]],
  ['휴일여러날', BASE, REAL, [
    { name:'휴일', start:'2026-12-24', end:'2026-12-26', role:R.CE_ROLE.ALL },
    { name:'휴일', start:'2026-12-31', end:'2027-01-02', role:R.CE_ROLE.ALL },
    { name:'휴일', start:'2026-11-11', end:'2026-11-11', role:R.CE_ROLE.BROADCAST },
    { name:'휴일', start:'2026-11-18', end:'2026-11-18', role:R.CE_ROLE.USHER }]],
  ['휴일명단없음', BASE, Object.assign({}, REAL, { holidaySermon: [], holidayBroadcast: [] }),
    [{ name:'휴일', start:'2026-11-11', end:'2026-11-11', role:R.CE_ROLE.ALL }]],
  ['토요명단없음', BASE, Object.assign({}, REAL, { satSermon: [], satBroadcast: [] }), []],
  ['백업명단없음', BASE, Object.assign({}, REAL, { door: [], praise: [], usher: [] }), []],
  ['한명씩', BASE, ONE, []],
  ['토요일없음', Object.assign({}, BASE, { dawnDows: [1,2,3,4,5] }), REAL, []],
  ['수목백업', Object.assign({}, BASE, { doorDows: [4], praiseDows: [2] }), REAL, []],
  ['토요별도없음', Object.assign({}, BASE, { satDows: [] }), REAL, []],
  ['기준일토요일', Object.assign({}, BASE, { anchor: '2026-09-05' }), REAL, []],
  ['전원예외', BASE, { sermon:['가','나'], broadcast:['ㄱ'] },
    [{ name:'가', start:'2026-11-01', end:'2026-11-30', role:R.CE_ROLE.ALL },
     { name:'나', start:'2026-11-01', end:'2026-11-30', role:R.CE_ROLE.ALL }]]
];

/* ---------- 무작위 조합 ---------- */

let seed = 20261031;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const POOL = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하',
  '김집사','이권사','박목사','최전도사','Janet Park','Mr. 정','홍 길동'];
const names = n => { const o = []; for (let i = 0; i < n; i++) o.push(pick(POOL)); return o; };

function randomCase(i) {
  const dows = [1,2,3,4,5,6].filter(() => rnd() < 0.9);
  const cfg = {
    anchor: '2026-' + String(int(1, 12)).padStart(2, '0') + '-' + String(int(1, 28)).padStart(2, '0'),
    dawnDows: dows.length ? dows : [1,2,3,4,5,6],
    satDows: rnd() < 0.8 ? [6] : [],
    doorDows: [pick([2,3,4])], praiseDows: [pick([5,6])]
  };
  const rot = {
    sermon: names(int(1, 14)), broadcast: names(int(1, 14)),
    satSermon: rnd() < 0.3 ? [] : names(int(1, 4)),
    satBroadcast: rnd() < 0.3 ? [] : names(int(1, 4)),
    door: rnd() < 0.2 ? [] : names(int(1, 8)),
    praise: rnd() < 0.2 ? [] : names(int(1, 8)),
    holidaySermon: rnd() < 0.4 ? [] : names(int(1, 3)),
    holidayBroadcast: rnd() < 0.4 ? [] : names(int(1, 3)),
    usher: rnd() < 0.2 ? [] : names(int(1, 10))
  };
  const all = [].concat(rot.sermon, rot.broadcast, rot.door, rot.praise, rot.usher);
  const roles = [R.CE_ROLE.ALL, R.CE_ROLE.SERMON, R.CE_ROLE.BROADCAST,
    R.CE_ROLE.DOOR, R.CE_ROLE.PRAISE, R.CE_ROLE.USHER];
  const ex = [];
  for (let k = 0; k < int(0, 8); k++) {
    const st = new Date(Date.UTC(2027, int(1, 12) - 1, int(1, 28)));
    const en = new Date(st.getTime() + int(0, 9) * 86400000);
    ex.push({
      name: rnd() < 0.25 ? pick(R.CE_HOLIDAY_NAMES) : (all.length ? pick(all) : '가'),
      start: st.toISOString().slice(0, 10), end: en.toISOString().slice(0, 10), role: pick(roles)
    });
  }
  return ['fuzz#' + i, cfg, rot, ex];
}

/* ---------- 돌리기 ---------- */

const ROUNDS = Number(process.argv[2] || 400);
const PICKED_MONTHS = monthsFrom(2026, 9, 18);     // 윤년 2028-02 포함
const FUZZ_MONTHS = monthsFrom(2027, 1, 14);

console.log('\n손으로 고른 설정 ' + CASES.length + '가지 x ' + PICKED_MONTHS.length + '달');
CASES.forEach(([label, cfg, rot, ex]) => {
  PICKED_MONTHS.forEach(([y, m]) => audit(label, cfg, rot, ex, y, m));
  auditStability(label, cfg, rot, ex, PICKED_MONTHS);
  process.stdout.write('  ' + label);
});

console.log('\n\n무작위 조합 ' + ROUNDS + '가지 x ' + FUZZ_MONTHS.length + '달');
for (let i = 0; i < ROUNDS; i++) {
  const [label, cfg, rot, ex] = randomCase(i);
  try {
    FUZZ_MONTHS.forEach(([y, m]) => audit(label, cfg, rot, ex, y, m));
    auditStability(label, cfg, rot, ex, FUZZ_MONTHS);
  } catch (e) {
    bad(label + ' 에서 터졌다: ' + e.message);
    console.log('    cfg=' + JSON.stringify(cfg));
    console.log('    rot=' + JSON.stringify(rot));
    console.log('    ex=' + JSON.stringify(ex));
    break;
  }
  if ((i + 1) % 100 === 0) process.stdout.write('  ' + (i + 1));
}

console.log('\n\n' + (fails === 0 ? '✓ 위반 없음' : '✗ ' + fails + '건 위반') +
  '  (검사 묶음 ' + groups + '개)');
process.exitCode = fails ? 1 : 0;
