#!/usr/bin/env python3
"""Optimized original Little World bridge - zero-tex vertex color GLB, three LODs.

V2 replaces per-slice *closed prisms* with exterior surface strips: interior faces,
hidden decking sidewalls, decorative stone box backs, and per-voussoir caps vanish.
The opening is geometric and remains fully open in all LODs.
"""
from pathlib import Path
import math, json, hashlib
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parents[2]/'public/models/structures/stone_bridge'; OUT.mkdir(parents=True,exist_ok=True)
COL={
 'wall':(164,151,125), 'wall_dark':(145,135,111),'stone':(189,174,143),
 'coping':(207,189,153),'deck':(190,175,146),'deck_light':(203,187,154),
 'arch':(199,180,145),'arch_dark':(167,151,127),'mortar':(127,119,102),
 'highlight':(214,199,170),'parapet':(172,156,130)
}
L=4.15; R=2.08; Y0=.06; Z=1.33

def top(x): return 1.64+.96*(1-(abs(x)/L)**1.65)
def underside(x): return Y0+math.sqrt(max(0,R*R-x*x)) if abs(x)<R else -0.14

class Build:
 def __init__(self): self.v=[]; self.f=[]; self.c=[]; self.groups={}
 def quad(self,p,color,expected,group):
  p=np.array(p,dtype=float)
  n=np.cross(p[1]-p[0],p[2]-p[0])
  if np.dot(n,expected)<0:p=p[[0,3,2,1]]
  # Reject degenerate faces rather than papering over them at export.
  if np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0])) <1e-10:return
  idx=len(self.v); self.v.extend(p.tolist()); self.f.extend([[idx,idx+1,idx+2],[idx,idx+2,idx+3]])
  self.c.extend([list(color)+[255]]*4)
  self.groups[group]=self.groups.get(group,0)+2
 def strip(self,a,c,lo,hi,z0,z1,col,group,bottom=False):
  # Four visible rectangular strips, no hidden internal endcaps.
  alo,clo=lo(a),lo(c);ahi,chi=hi(a),hi(c)
  self.quad([(a,alo,z0),(c,clo,z0),(c,chi,z0),(a,ahi,z0)],col,(0,0,-1),group)
  self.quad([(a,alo,z1),(c,clo,z1),(c,chi,z1),(a,ahi,z1)],col,(0,0,1),group)
  self.quad([(a,ahi,z0),(c,chi,z0),(c,chi,z1),(a,ahi,z1)],col,(0,1,0),group)
  if bottom:self.quad([(a,alo,z0),(c,clo,z0),(c,clo,z1),(a,alo,z1)],col,(0,-1,0),group)
 def mesh(self):
  m=trimesh.Trimesh(vertices=np.asarray(self.v,dtype=np.float32),faces=np.asarray(self.f,dtype=np.int64),process=False)
  m.visual.vertex_colors=np.asarray(self.c,dtype=np.uint8)
  assert np.isfinite(m.vertices).all() and (m.area_faces>1e-9).all()
  return m

def build(lod):
 b=Build()
 ns=[18,12,8][lod]
 xs=np.array(sorted(set([round(float(x),6) for x in np.linspace(-L,L,ns+1)]+[-R,R,0.])))
 # Main stone mass: arch opening exists by construction. Each slice carries only
 # *external* faces (no 2-tri endcaps on every subdivision).
 for i,(a,c) in enumerate(zip(xs[:-1],xs[1:])):
  color=COL['wall_dark'] if i%4==1 else COL['wall']
  b.strip(a,c,underside,lambda x:top(x)-.045,-Z,Z,color,'body',bottom=True)
 for x,normal in [(-L,(-1,0,0)),(L,(1,0,0))]:
  b.quad([(x,underside(x),-Z),(x,underside(x),Z),(x,top(x)-.045,Z),(x,top(x)-.045,-Z)],COL['wall'],normal,'body_caps')
 # Paving: top-only surface patches over the structural crown, no invisible
 # underface/edge box geometry. Gaps reveal the supporting stone top.
 slabs=[12,7,3][lod]
 for j in range(slabs):
  a=-L+2*L*(j+.08)/slabs;c=-L+2*L*(j+.92)/slabs
  col=[COL['deck'],COL['deck_light'],COL['stone']][(j*7)%3]
  b.quad([(a,top(a)+.042,-1.09),(c,top(c)+.042,-1.09),
          (c,top(c)+.042,1.09),(a,top(a)+.042,1.09)],col,(0,1,0),'paving')
 # Parapet: continuous masonry strips with material-color block rhythm.
 # Quads only on visible inner/outer/top/bottom, plus two terminal caps.
 rail_n=[11,7,4][lod]
 for side in [-1,1]:
  z0,z1=(-1.47,-1.14) if side<0 else (1.14,1.47)
  def rlo(x):return top(x)+.01
  def rhi(x):return top(x)+.47
  for j in range(rail_n):
   a=-L+2*L*j/rail_n;c=-L+2*L*(j+1)/rail_n
   col=[COL['parapet'],COL['stone'],COL['wall']][(j+3*(side+1))%3]
   b.strip(a,c,rlo,rhi,z0,z1,col,'parapet',bottom=True)
  for x,n in [(-L,(-1,0,0)),(L,(1,0,0))]:
   b.quad([(x,rlo(x),z0),(x,rlo(x),z1),(x,rhi(x),z1),(x,rhi(x),z0)],COL['parapet'],n,'parapet_caps')
  if lod<=1:
   # Top coping split in *fewer* segments than parapet stones; no tiny gaps.
   cp_n=[5,3][lod]
   for j in range(cp_n):
    a=-L+2*L*j/cp_n;c=-L+2*L*(j+1)/cp_n
    col=COL['highlight'] if j%3==0 else COL['coping']
    b.strip(a,c,lambda x:top(x)+.45,lambda x:top(x)+.54,
            z0-.04,z1+.04,col,'coping',bottom=False)
   for x,n in [(-L,(-1,0,0)),(L,(1,0,0))]:
    b.quad([(x,top(x)+.45,z0-.04),(x,top(x)+.45,z1+.04),
            (x,top(x)+.54,z1+.04),(x,top(x)+.54,z0-.04)],COL['coping'],n,'coping_caps')
 # Arch voussoirs: visible face polygons only. The previous generator had
 # 12 triangles per stone because of hidden backs/sides (~80% redundant).
 vous=[13,9,6][lod]
 for front in (True,False):
  zz=-Z-.055 if front else Z+.055
  norm=(0,0,-1) if front else (0,0,1)
  for j in range(vous):
   th0=math.pi*j/vous+.006;th1=math.pi*(j+1)/vous-.006
   inner=R+.012;outer=R+.28
   points=[(inner*math.cos(th0),Y0+inner*math.sin(th0),zz),
           (outer*math.cos(th0),Y0+outer*math.sin(th0),zz),
           (outer*math.cos(th1),Y0+outer*math.sin(th1),zz),
           (inner*math.cos(th1),Y0+inner*math.sin(th1),zz)]
   col=[COL['arch'],COL['arch_dark'],COL['stone'],COL['coping']][(j+int(front))%4]
   b.quad(points,col,norm,'arch_stones')
 # Flat stone relief patches on both facades; invisible side/back faces of
 # the original individual boxes dropped. Color and layout are maintained.
 if lod<2:
  for front in (-1,1):
   zz=-Z-.057 if front<0 else Z+.057
   normal=(0,0,front)
   rows=[(.22,.51),(.67,.95),(1.12,1.42)] if lod==0 else [(.34,.61),(1.13,1.42)]
   for rid,(lo,hi) in enumerate(rows):
    for side in (-1,1):
     for k in range(3 if lod==0 else 2):
      xa=2.47+(k*.52 if lod==0 else k*.78)
      xb=min(xa+(.48 if lod==0 else .68),3.87)
      if side==-1:xa,xb=-xb,-xa
      if min(top(xa),top(xb))<hi+.06:continue
      col=[COL['stone'],COL['wall_dark'],COL['coping']][(k+rid+int(front>0))%3]
      b.quad([(xa,lo,zz),(xb,lo,zz),(xb,hi,zz),(xa,hi,zz)],col,normal,'facade_stones')
 return b

stats={}
for lod in range(3):
 b=build(lod); mesh=b.mesh(); dst=OUT/f'lod{lod}.glb'
 dst.write_bytes(trimesh.exchange.gltf.export_glb(mesh,include_normals=True))
 imp=trimesh.load(dst,force='scene').to_geometry()
 assert len(imp.faces)==len(mesh.faces) and imp.visual.kind=='vertex'
 assert (imp.area_faces>1e-9).all() and np.allclose(mesh.bounds,imp.bounds,atol=1e-5)
 stats[f'lod{lod}']={'file':f'models/structures/stone_bridge/lod{lod}.glb','triangles':len(mesh.faces),
  'components':b.groups,'sizeBytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),
  'boundsMeters':np.round(mesh.bounds,4).tolist()}
print(json.dumps(stats,indent=2))
orig={"lod0":1776,"lod1":1044,"lod2":408}
assert all(stats[k]['triangles']<orig[k] for k in orig)
(ROOT/'manifest.generated.json').write_text(json.dumps({
 'schemaVersion':1,'id':'structure.stone_bridge.simple_v2_optimized','status':'ART_APPROVED_RUNTIME_NOT_QUALIFIED',
 'license':'project-original','units':'meters','axis':'Y_UP','textures':0,
 'lengthMeters':2*L,'widthMeters':2*1.51,'archClearSpanMeters':2*R,
 'deckHeightCenterMeters':top(0),'deckHeightEndsMeters':top(L),
 'lods':stats,'previousTriangles':orig,
 'placement':{'spanAxis':'X','origin':[0,0,0],'westBankAnchor':[-L,top(-L),0],
  'eastBankAnchor':[L,top(L),0]},
 'note':'V2 geometry is optimized V1 bridge: visible faces only. Non-watertight intentional decorative facade and deck meshes. Physics/navmeshes separate.'
},indent=2,ensure_ascii=False)+'\n')