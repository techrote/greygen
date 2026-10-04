#!/usr/bin/env python3
"""Greygen #21 representation-only reference. Python 3.10+, standard library.
Run: python prototype.py --out results
No audio realization, browser, network, or repository writes.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
import platform
import random
import sys
from pathlib import Path

BASE_COMMIT = '00ab20354d2ba2af7ca41147f01f324c70c74006'
GRID_ID = 'log2-31p25-96ppo-20-20000-v1'
# Literal binary64 endpoints; do not regenerate using a platform-specific log.
X_MIN = float.fromhex('-0x1.49a784bcd1b8bp-1')
X_MAX = float.fromhex('0x1.2a4d3c25e68dcp+3')
X = (X_MIN,) + tuple(j / 96 for j in range(-61, 895)) + (X_MAX,)
CENTERS = tuple(31.25 * 2 ** i for i in range(10))
CENTER_INDICES = tuple(X.index(float(i)) for i in range(10))
N = len(X)
LOW, HIGH = -24.0, 24.0
SILENT_MAX_DB = 1e-6  # numerical preservation, NOT an audibility threshold
SOLVER_TOL_DB = 1e-12
MAX_SWEEPS = 10000

def finite_vector(values, length, label):
    if len(values) != length:
        raise ValueError(f'{label}: expected {length} values')
    if any(isinstance(v, bool) or not isinstance(v, (float, int))
           or not math.isfinite(v) for v in values):
        raise ValueError(f'{label}: finite numeric values required')
    return tuple(float(v) for v in values)

def preset(id: str) -> tuple[float, ...]:
    slopes = {'white': 0.0, 'pink': -3.0103, 'brown': -6.0206}
    if id in slopes:
        return tuple(slopes[id] * i for i in range(10))
    if id == 'grey':
        raw = [5 * (1 - math.exp(-0.1 * (i - 5) ** 2))
               + 0.15 * max(i - 5, 0) for i in range(10)]
        return tuple(v - max(raw) for v in raw)
    raise ValueError(f'unknown preset {id!r}')

def basis(x: float) -> tuple[float, ...]:
    b = [0.0] * 10
    if x <= 0:
        b[0] = 1.0
    elif x >= 9:
        b[9] = 1.0
    else:
        i = int(math.floor(x))
        b[i], b[i + 1] = 1 - (x - i), x - i
    return tuple(b)

B = tuple(basis(x) for x in X)

def lift(values) -> tuple[float, ...]:
    values = finite_vector(values, 10, 'band values')
    return tuple(math.fsum(a * c for a, c in zip(row, values)) for row in B)

BASE = {id: lift(preset(id)) for id in ('white', 'pink', 'brown', 'grey')}

def expand(id: str, offsets) -> tuple[float, ...]:
    offsets = finite_vector(offsets, 10, 'offsets')
    if any(v < LOW or v > HIGH for v in offsets):
        raise ValueError('offset outside [-24, 24]')
    # Base plus interpolated offset avoids subtracting large target slopes in lift.
    return tuple(a + b for a, b in zip(BASE[id], lift(offsets)))

def validate_curve(id: str, target) -> tuple[float, ...]:
    if id not in BASE:
        raise ValueError('unknown base preset')
    target = finite_vector(target, N, 'target')
    # Test the actual binary64 endpoint envelope, not an arbitrary DSP gain floor.
    if any(h < b + LOW or h > b + HIGH for h, b in zip(target, BASE[id])):
        raise ValueError('advanced offset outside base +/-24 dB envelope')
    return target

def edit_nodes(id: str, target, edits) -> tuple[float, ...]:
    """Atomic replacement by canonical index; reject duplicate/invalid indices."""
    old = validate_curve(id, target)
    new = list(old)
    seen = set()
    for index, value in edits:
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < N:
            raise ValueError('invalid knot index')
        if index in seen:
            raise ValueError('duplicate knot index')
        seen.add(index)
        new[index] = value
    return validate_curve(id, new)

def inner(a, b) -> float:
    """Exact integral for products of two piecewise-linear curves, up to FP."""
    return math.fsum((X[k+1] - X[k]) / 6 *
        (2*a[k]*b[k] + a[k]*b[k+1] + a[k+1]*b[k] + 2*a[k+1]*b[k+1])
        for k in range(N-1))

COLUMNS = tuple(tuple(row[i] for row in B) for i in range(10))
G = tuple(tuple(inner(a, b) for b in COLUMNS) for a in COLUMNS)

def clip(v: float) -> float:
    return max(LOW, min(HIGH, v))

def solve_box(rhs):
    """Fixed-order cyclic exact coordinate minimization of the SPD box QP.
    This is not unconstrained fitting followed by componentwise clipping.
    """
    u = [0.0] * 10
    for sweep in range(1, MAX_SWEEPS + 1):
        for i in range(10):
            rest = math.fsum(G[i][j] * u[j] for j in range(10) if j != i)
            u[i] = clip((rhs[i] - rest) / G[i][i])
        grad = [math.fsum(G[i][j] * u[j] for j in range(10)) - rhs[i]
                for i in range(10)]
        violation = max(abs(u[i] - clip(u[i] - grad[i]/G[i][i])) for i in range(10))
        if violation <= SOLVER_TOL_DB:
            return tuple(u), sweep, violation
    raise RuntimeError('projection did not converge; do not authorize conversion')

def metrics(target, reconstructed):
    residual = tuple(a-b for a, b in zip(target, reconstructed))
    peak = max(abs(r) for r in residual)
    worst = max(range(N), key=lambda k: abs(residual[k]))  # earliest tie wins
    return {'max_abs_db': peak,
            'rms_log_db': math.sqrt(max(0, inner(residual, residual)/(X_MAX-X_MIN))),
            'worst_knot_index': worst,
            'worst_frequency_hz': 31.25 * 2 ** X[worst]}

def classify(m):
    # Leave a numerical guard band below the preservation budget.
    return 'silent-numerical' if m['max_abs_db'] + 1e-10 <= SILENT_MAX_DB else 'confirm-approximation'

def project(id: str, target):
    target = validate_curve(id, target)
    residual = tuple(h-b for h, b in zip(target, BASE[id]))
    rhs = tuple(inner(col, residual) for col in COLUMNS)
    offsets, sweeps, violation = solve_box(rhs)
    reconstruction = expand(id, offsets)
    m = metrics(target, reconstruction)
    return {'target_id': id, 'offsets_db': list(offsets),
            'metrics': m, 'decision': classify(m),
            'sweeps': sweeps, 'projected_kkt_violation_db': violation,
            'active_bounds': [i for i, u in enumerate(offsets) if u in (LOW, HIGH)]}

def to_document(id, target):
    return {'schemaVersion': 1, 'kind': 'greygen-logdb-target',
            'gridId': GRID_ID, 'units': 'relative-psd-db',
            'baseTarget': {'id': id, 'schemaVersion': 1, 'revision': 1},
            'edgePolicy': 'hold-endpoints',
            'targetDbByKnot': list(validate_curve(id, target))}

def from_document(doc):
    expected = {'schemaVersion', 'kind', 'gridId', 'units', 'baseTarget', 'edgePolicy', 'targetDbByKnot'}
    if not isinstance(doc, dict) or set(doc) != expected:
        raise ValueError('invalid target document fields')
    if (type(doc['schemaVersion']) is not int or doc['schemaVersion'] != 1
        or doc['kind'] != 'greygen-logdb-target' or doc['gridId'] != GRID_ID
        or doc['units'] != 'relative-psd-db' or doc['edgePolicy'] != 'hold-endpoints'):
        raise ValueError('unsupported target contract')
    base = doc['baseTarget']
    if not isinstance(base, dict) or set(base) != {'id', 'schemaVersion', 'revision'}:
        raise ValueError('invalid base target identity')
    if type(base['schemaVersion']) is not int or type(base['revision']) is not int or base['schemaVersion'] != 1 or base['revision'] != 1:
        raise ValueError('unsupported base target identity')
    return base['id'], validate_curve(base['id'], doc['targetDbByKnot'])

def slope(target, lo=2.0, hi=8.0):
    # 125..8000 Hz. This is slope of stored target, NOT a rendered PSD fit.
    pairs = [(x, h) for x, h in zip(X, target) if lo <= x <= hi]
    meanx = math.fsum(x for x,h in pairs)/len(pairs)
    meany = math.fsum(h for x,h in pairs)/len(pairs)
    return math.fsum((x-meanx)*(h-meany) for x,h in pairs)/math.fsum((x-meanx)**2 for x,h in pairs)

def run(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    cases = []
    curves = []
    def record(name, id, target, original_offsets=None, expected=None):
        p = project(id, target)
        if expected:
            assert p['decision'] == expected, (name, p)
        p['name'] = name
        p['target_slope_125_8000_db_oct'] = slope(target)
        if original_offsets is not None:
            p['control_roundtrip_max_db'] = max(abs(a-b) for a,b in zip(original_offsets, p['offsets_db']))
        back = expand(id, p['offsets_db'])
        p2 = project(id, back)
        p['projection_idempotence_max_db'] = max(abs(a-b) for a,b in zip(p['offsets_db'],p2['offsets_db']))
        assert p['projection_idempotence_max_db'] < 1e-10
        # JSON round trip preserves all stored doubles in this environment.
        encoded = json.dumps(to_document(id, target), allow_nan=False, separators=(',', ':'))
        restored_id, restored = from_document(json.loads(encoded))
        assert restored_id == id and restored == target
        cases.append(p)
        curves.append((name, target, back))
        return p

    for id in ('white','pink','brown','grey'):
        record(id+'_neutral', id, expand(id, [0.0]*10), [0.0]*10, 'silent-numerical')
    fractional = [0.25,-1.125,2.75,-3.5,4.125,-5.25,6.375,-7.5,8.625,-9.75]
    record('pink_fractional_controls','pink',expand('pink',fractional),fractional,'silent-numerical')
    extremes = [-24.0,24.0]*5
    record('brown_alternating_bounds','brown',expand('brown',extremes),extremes,'silent-numerical')
    notch_index = X.index(5.5)
    target = edit_nodes('white', expand('white',[0.0]*10), [(notch_index,-24.0)])
    notch = record('white_narrow_notch_24db','white',target,expected='confirm-approximation')
    notch['notch'] = {'center_hz': 31.25*2**5.5, 'depth_db':24.0,
        'support_width_octaves':1/48, 'support_width_hz':31.25*(2**(5.5+1/96)-2**(5.5-1/96)),
        'center_only_false_negative_max_db':max(abs(target[i]) for i in CENTER_INDICES),
        'naive_center_sampling_true_metrics': metrics(target, expand('white',[0.0]*10))}
    for depth, label, decision in ((0.5e-6,'below','silent-numerical'),(2e-6,'above','confirm-approximation')):
        h = edit_nodes('white', expand('white',[0.0]*10),[(notch_index,-depth)])
        record('notch_'+label+'_numerical_budget','white',h,expected=decision)
    # Valid fine-grid step that forces active box constraints.
    step = tuple(24.0 if x < 5.5 else -24.0 for x in X)
    record('white_bounded_step','white',step,expected='confirm-approximation')
    assert cases[-1]['active_bounds']
    edge = edit_nodes('white',expand('white',[0.0]*10),[(0,-24.0),(N-1,24.0)])
    record('white_both_domain_edges','white',edge,expected='confirm-approximation')
    # UI rounding is a distinct transform, never silently conflated with projection.
    fcurve=expand('pink',fractional)
    rounded=[float(math.floor(v+0.5)) for v in fractional]  # defined ties toward +infinity
    qm=metrics(fcurve,expand('pink',rounded))
    quantization={'rule':'nearest 1 dB; half ties toward +infinity (negative control, NOT recommended)',
                  'metrics':qm,'decision':classify(qm)}
    assert quantization['decision']=='confirm-approximation'
    rng=random.Random(21004)
    random_max=0.0
    for j in range(160):
        id=('white','pink','brown','grey')[j%4]
        u=[rng.uniform(-24,24) for _ in range(10)]
        p=project(id,expand(id,u))
        assert p['decision']=='silent-numerical'
        e=max(abs(a-b) for a,b in zip(u,p['offsets_db']))
        random_max=max(random_max,e)
        assert e<1e-10
    invalid=0
    white=expand('white',[0.0]*10)
    for operation in (
        lambda: validate_curve('white',[0.0]),
        lambda: edit_nodes('white',white,[(3,float('nan'))]),
        lambda: edit_nodes('white',white,[(3,float('inf'))]),
        lambda: edit_nodes('white',white,[(3,True)]),
        lambda: edit_nodes('white',white,[(3,24.1)]),
        lambda: edit_nodes('white',white,[(3,0.0),(3,1.0)]),
        lambda: edit_nodes('white',white,[(N,0.0)]),
        lambda: expand('white',[25.0]*10),
        lambda: from_document({**to_document('white',white),'gridId':'unknown'}),
        lambda: from_document({**to_document('white',white),'schemaVersion':2}),
    ):
        try: operation()
        except ValueError: invalid+=1
        else: raise AssertionError('invalid input accepted')
    report={'scope':'target-space representation only; no audio rendered',
        'base_commit':BASE_COMMIT,'grid_id':GRID_ID,'knots':N,
        'silent_max_db':SILENT_MAX_DB,'numerical_guard_db':1e-10,
        'solver_tolerance_db':SOLVER_TOL_DB,
        'cases':cases,'ui_1db_rounding_negative_control':quantization,
        'random_simple_roundtrips':{'count':160,'seed':21004,'max_control_error_db':random_max},
        'invalid_inputs_rejected':invalid,
        'all_assertions_passed':True}
    (out/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    (out/'grid.json').write_text(json.dumps({'gridId':GRID_ID,'xLog2Relative31p25Hz':X},indent=2)+'\n')
    (out/'notch-target.json').write_text(json.dumps(to_document('white',target),indent=2)+'\n')
    (out/'environment.json').write_text(json.dumps({'python':sys.version,'platform':platform.platform(),
        'implementation':platform.python_implementation(),'dependencies':'Python standard library only',
        'command':'python prototype.py --out results'},indent=2)+'\n')
    with (out/'curves.csv').open('w',newline='') as f:
        writer=csv.writer(f)
        writer.writerow(['knot','x_log2_31p25','frequency_hz']+[s for name,_,_ in curves for s in (name+'_target_db',name+'_projected_db')])
        for k,x in enumerate(X):
            writer.writerow([k,x,31.25*2**x]+[v for _,a,b in curves for v in (a[k],b[k])])
    for p in cases:
        print(f"{p['name']}: peak={p['metrics']['max_abs_db']:.12g} dB rms={p['metrics']['rms_log_db']:.12g} dB {p['decision']}")
    print(f'PASS: {len(cases)} named cases, 160 generated simple roundtrips, {invalid} invalid inputs rejected')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=Path('results'))
    args=parser.parse_args()
    run(args.out)
