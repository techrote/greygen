#!/usr/bin/env python3
"""Independent quadrature/SVD-active-set check. Optional NumPy + SciPy only.
Run after prototype.py: python crosscheck_scipy.py --out results
Not a runtime dependency recommendation for Greygen.
"""
import argparse
import csv
import json
import math
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import lsq_linear
import prototype as p

def run(out):
    # Independent assembly: two-point Gauss integration on each linear interval.
    A=[]
    points=[]
    for k in range(p.N-1):
        dx=p.X[k+1]-p.X[k]
        for t in ((1-1/math.sqrt(3))/2,(1+1/math.sqrt(3))/2):
            x=p.X[k]+dx*t
            A.append(np.array(p.basis(x))*math.sqrt(dx/2))
            points.append((k,t,math.sqrt(dx/2)))
    A=np.array(A)
    rows=list(csv.DictReader((out/'curves.csv').open()))
    tests=json.loads((out/'results.json').read_text())['cases']
    inputs=[(t['name'],t['target_id'],tuple(float(row[t['name']+'_target_db']) for row in rows)) for t in tests]
    rng=np.random.default_rng(21004)
    for j in range(32):
        id=('white','pink','brown','grey')[j%4]
        h=np.array(p.BASE[id])+rng.uniform(-24,24,p.N)
        inputs.append((f'random_advanced_{j}',id,tuple(h)))
    results=[]
    for name,id,h in inputs:
        r=np.array(h)-p.BASE[id]
        y=np.array([((1-t)*r[k]+t*r[k+1])*w for k,t,w in points])
        solution=lsq_linear(A,y,bounds=(-24,24),method='bvls',tol=1e-13,lsq_solver='exact',max_iter=1000)
        assert solution.success, solution.message
        custom=p.project(id,h)
        delta=float(np.max(np.abs(solution.x-custom['offsets_db'])))
        assert delta<1e-8, (name,delta)
        c=np.array(custom['offsets_db'])
        err=A@c-y
        gauss_rms=float(np.linalg.norm(err)/math.sqrt(p.X_MAX-p.X_MIN))
        assert abs(gauss_rms-custom['metrics']['rms_log_db'])<1e-10
        item={'name':name,'max_control_disagreement_db':delta,'scipy_status':int(solution.status),
              'scipy_optimality':float(solution.optimality),'custom_kkt_db':custom['projected_kkt_violation_db']}
        if name=='white_bounded_step':
            unconstrained=np.linalg.lstsq(A,y,rcond=None)[0]
            clipped=np.clip(unconstrained,-24,24)
            item['unconstrained_then_clip_rms_db']=float(np.linalg.norm(A@clipped-y)/math.sqrt(p.X_MAX-p.X_MIN))
            item['bounded_optimum_rms_db']=gauss_rms
        results.append(item)
    output={'scope':'independent numerical cross-check of representation projection, not audio',
        'numpy_version':np.__version__,'scipy_version':scipy.__version__,
        'scipy_method':'lsq_linear / bvls / dense exact QR or SVD',
        'fixture_count':len(results),
        'max_control_disagreement_db':max(r['max_control_disagreement_db'] for r in results),
        'gram_assembly_max_difference':float(np.max(np.abs(A.T@A-np.array(p.G)))),
        'gram_smallest_eigenvalue':float(np.linalg.eigvalsh(np.array(p.G))[0]),
        'gram_condition_number_2':float(np.linalg.cond(np.array(p.G))),
        'all_assertions_passed':True,'cases':results}
    (out/'crosscheck.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:v for k,v in output.items() if k!='cases'},indent=2))

if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--out',type=Path,default=Path('results'))
    run(a.parse_args().out)
