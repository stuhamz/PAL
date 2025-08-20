# analyze.py — robust PAL result summarizer (tolerates missing user_id/persona)
# Usage:  python analyze.py sessions.csv [run-*.ndjson]

import sys, csv, statistics as stats
from collections import defaultdict, Counter

def read_csv(path):
    rows=[]
    with open(path, newline='', encoding='utf-8') as fp:
        rd=csv.DictReader(fp)
        for r in rd:
            rows.append(r)
    return rows

def nonempty(x): return (x is not None) and (str(x) != '')
def safeint(x, d=0):
    try: return int(x)
    except: return d
def safefloat(x, d=0.0):
    try: return float(x)
    except: return d

def get_user_key(r):
    # Prefer user_id; fall back to persona; else "0"
    uid = (r.get('user_id') or '').strip()
    if nonempty(uid): return uid
    pid = (r.get('persona') or '').strip()
    return pid if nonempty(pid) else "0"

def auc_roc(scores_labels):
    if not scores_labels: return 0.5, []
    uniq = sorted(set(s for s,_ in scores_labels))
    ths = [min(uniq)-1] + uniq + [max(uniq)+1]
    P = sum(1 for _,y in scores_labels if y==1)
    N = sum(1 for _,y in scores_labels if y==0)
    if P==0 or N==0: return 0.5, []
    pts=[]
    for t in ths:
        tp = sum(1 for s,y in scores_labels if (y==1 and s>=t))
        fp = sum(1 for s,y in scores_labels if (y==0 and s>=t))
        tpr = tp / P
        fpr = fp / N
        pts.append((fpr,tpr))
    pts = sorted(pts)
    auc=0.0
    for i in range(1,len(pts)):
        x0,y0 = pts[i-1]; x1,y1 = pts[i]
        auc += (x1-x0)*(y0+y1)/2.0
    return auc, pts

def print_roc(auc, pts, tag):
    print(f"\nROC/AUC ({tag}): AUC={auc:.3f}  (points={len(pts)})")

def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze.py sessions.csv [run-*.ndjson]")
        sys.exit(1)
    sess_path = sys.argv[1]
    rows = read_csv(sess_path)
    if not rows:
        print("No rows."); sys.exit(1)

    # Normalize missing columns so downstream code is safe
    for r in rows:
        for k in ['mode','persona','user_id','url','probe2d_hash','probewebgl_hash',
                  'calls_toDataURL','calls_toBlob','calls_getImageData','calls_readPixels',
                  'load_ms','csp_strict','sandboxed_iframes']:
            r.setdefault(k,'')

    modes = Counter(r['mode'] for r in rows)
    urls  = len(set(r.get('url','') for r in rows))
    personas = len(set((r.get('persona','') or '0') for r in rows))
    print("=== PAL Large-Scale Summary ===")
    print(f"Total rows: {len(rows)} | URLs: {urls} | Personas: {personas} | By mode: {dict(modes)}")

    on_rows  = [r for r in rows if r.get('mode')=='on']
    off_rows = [r for r in rows if r.get('mode')=='off']

    cov_2d_off = 100.0 * sum(1 for r in off_rows if nonempty(r['probe2d_hash']))   / max(1,len(off_rows))
    cov_gl_off = 100.0 * sum(1 for r in off_rows if nonempty(r['probewebgl_hash']))/ max(1,len(off_rows))
    cov_2d_on  = 100.0 * sum(1 for r in on_rows  if nonempty(r['probe2d_hash']))   / max(1,len(on_rows))
    cov_gl_on  = 100.0 * sum(1 for r in on_rows  if nonempty(r['probewebgl_hash']))/ max(1,len(on_rows))

    print("\nCoverage (non-empty hashes)")
    print(f"  2D: off={cov_2d_off:.1f}% on={cov_2d_on:.1f}%")
    print(f"  WebGL: off={cov_gl_off:.1f}% on={cov_gl_on:.1f}%")

    # OFF→ON change: pair within (user,url,persona) when available; otherwise (url,persona)
    def off_key(r):
        return (get_user_key(r), r.get('persona','0'), r.get('url',''))
    keyed_off = {}
    for r in off_rows:
        k = off_key(r)
        if k not in keyed_off:
            keyed_off[k] = r  # first OFF per key

    deltas=[]
    for r in on_rows:
        k = off_key(r)
        if k in keyed_off:
            o = keyed_off[k]
            d2d = (nonempty(o['probe2d_hash']) and nonempty(r['probe2d_hash']) and (o['probe2d_hash'] != r['probe2d_hash']))
            dgl = (nonempty(o['probewebgl_hash']) and nonempty(r['probewebgl_hash']) and (o['probewebgl_hash'] != r['probewebgl_hash']))
            deltas.append((d2d,dgl))
    if deltas:
        tot=len(deltas)
        ch2d=100.0*sum(1 for d2d,_ in deltas if d2d)/tot
        chgl=100.0*sum(1 for _,dgl in deltas if dgl)/tot
        print(f"\nPaired OFF/ON (same url,persona,~user): {tot} usable for deltas")
        print(f"  2D change: {ch2d:.1f}%")
        print(f"  WebGL change: {chgl:.1f}%")
    else:
        print("\nPaired OFF/ON: 0 usable (ensure same urls/personas across modes)")

    # Hook activity (ON)
    hook_on = 100.0 * sum(
        1 for r in on_rows
        if (safeint(r['calls_toDataURL']) + safeint(r['calls_toBlob']) +
            safeint(r['calls_getImageData']) + safeint(r['calls_readPixels'])) > 0
    ) / max(1,len(on_rows))
    print(f"\nON hook-activity rate: {hook_on:.1f}%")

    # Overhead
    def med_load(sub):
        xs=[safefloat(r['load_ms']) for r in sub if nonempty(r['load_ms'])]
        return (stats.median(xs) if xs else None)
    med_off, med_on = med_load(off_rows), med_load(on_rows)
    if med_off is not None and med_on is not None:
        pct = 100.0*(med_on - med_off)/max(1.0,med_off)
        print(f"\nOverhead (median load_ms): OFF={med_off:.0f} ms, ON={med_on:.0f} ms (Δ={pct:+.1f}%)")
    else:
        print("\nOverhead: insufficient perf data")

    # Stratifications
    def strat(name, pred):
        a_on  = [r for r in on_rows  if pred(r)]
        a_off = [r for r in off_rows if pred(r)]
        print(f"\nStratified (ON n={len(a_on)}): {name}")
        cov2 = 100.0*sum(1 for r in a_on if nonempty(r['probe2d_hash']))/max(1,len(a_on))
        covg = 100.0*sum(1 for r in a_on if nonempty(r['probewebgl_hash']))/max(1,len(a_on))
        print(f"  Coverage 2D={cov2:.1f}% GL={covg:.1f}%")
        keyed = {}
        for r in a_off:
            k = (get_user_key(r), r.get('persona','0'), r.get('url',''))
            if k not in keyed: keyed[k]=r
        ds=[]
        for r in a_on:
            k=(get_user_key(r), r.get('persona','0'), r.get('url',''))
            if k in keyed:
                o=keyed[k]
                d2d=(nonempty(o['probe2d_hash']) and nonempty(r['probe2d_hash']) and (o['probe2d_hash']!=r['probe2d_hash']))
                dgl=(nonempty(o['probewebgl_hash']) and nonempty(r['probewebgl_hash']) and (o['probewebgl_hash']!=r['probewebgl_hash']))
                ds.append((d2d,dgl))
        if ds:
            tot=len(ds)
            print(f"  OFF→ON change: 2D={100.0*sum(1 for a,_ in ds if a)/tot:.1f}%, GL={100.0*sum(1 for _,b in ds if b)/tot:.1f}%")
        else:
            print("  (no paired rows in this bucket)")
    strat("CSP strict", lambda r: (r.get('csp_strict','0')=='1'))
    strat("Sandboxed iframes", lambda r: safeint(r.get('sandboxed_iframes','0'))>0)

    # End-to-end re-identification (mode-wise)
    def build_pairs(mode_rows, max_pairs=200000):
        by_user=defaultdict(list)
        for r in mode_rows:
            by_user[get_user_key(r)].append(r)
        users=list(by_user.keys())
        pos=[]
        for u in users:
            L=by_user[u]; n=len(L)
            for i in range(n):
                for j in range(i+1,n):
                    if L[i].get('url','') == L[j].get('url',''): continue
                    pos.append((L[i],L[j],1))
                    if len(pos)>max_pairs: break
                if len(pos)>max_pairs: break
        neg=[]
        for i,u1 in enumerate(users):
            for u2 in users[i+1:]:
                A=by_user[u1]; B=by_user[u2]
                m=min(len(A),len(B))
                for k in range(m):
                    neg.append((A[k],B[k],0))
                    if len(neg)>=len(pos) or len(neg)>max_pairs: break
                if len(neg)>=len(pos) or len(neg)>max_pairs: break
            if len(neg)>=len(pos) or len(neg)>max_pairs: break
        return pos+neg

    def score_pair(a,b):
        s=0
        if nonempty(a.get('probe2d_hash')) and nonempty(b.get('probe2d_hash')):
            s += 1 if (a['probe2d_hash']==b['probe2d_hash']) else 0
        if nonempty(a.get('probewebgl_hash')) and nonempty(b.get('probewebgl_hash')):
            s += 1 if (a['probewebgl_hash']==b['probewebgl_hash']) else 0
        return s

    for tag, subset in (('OFF', off_rows), ('ON', on_rows)):
        pairs = build_pairs(subset)
        scores_labels = [(score_pair(a,b), lab) for (a,b,lab) in pairs]
        auc, pts = auc_roc(scores_labels)
        print_roc(auc, pts, tag)

    # Decision hint
    ok_cov = (cov_2d_on>=90.0 and cov_gl_on>=90.0)
    ok_change = (len(deltas)>0 and
                 (sum(1 for d2d,_ in deltas if d2d)/len(deltas) >= 0.95) and
                 (sum(1 for _,dgl in deltas if dgl)/len(deltas) >= 0.90))
    ok_hook = (hook_on >= 60.0)
    print("\nDecision:")
    print(f"  Coverage ≥90% on 2D+WebGL (ON): {'OK' if ok_cov else 'NO'}")
    print(f"  Change rates (2D ≥95%, WebGL ≥90%): {'OK' if ok_change else 'NO'}")
    print(f"  Hook activity (≥60% of ON rows): {'OK' if ok_hook else 'NO'}")
    print(f"\n=> GO FOR PAPER RESULTS: {'YES' if (ok_cov and ok_change) else 'NO'}")

    with open('report_summary.txt','w',encoding='utf-8') as w:
        w.write(f"Rows={len(rows)} URLs={urls} Personas={personas} Modes={dict(modes)}\n")
        w.write(f"Coverage ON: 2D={cov_2d_on:.1f}% GL={cov_gl_on:.1f}%\n")
        if deltas:
            w.write(f"OFF→ON change: 2D={100.0*sum(1 for d2d,_ in deltas if d2d)/len(deltas):.1f}% "
                    f"GL={100.0*sum(1 for _,dgl in deltas if dgl)/len(deltas):.1f}%\n")
        w.write(f"Hook ON={hook_on:.1f}%\n")

if __name__ == '__main__':
    main()
