"""Generate Little World N2 wooden trade cabin GLB and offline WebGL viewer, following approved N1.
Geometry intentionally authored from closed simple low-poly primitives, no purchased assets.
"""
from __future__ import annotations
import base64, math, json, struct, collections, pathlib, textwrap
import numpy as np
import trimesh

OUT=pathlib.Path(__file__).resolve().parent
CATEGORIES=['wood','wood_dark','wood_light','wood_edge','cloth_red','cloth_cream','cloth_seam','rope','metal','panel','logo','accent']
CAT={v:i for i,v in enumerate(CATEGORIES)}
PALETTES={
 'tropical':['#a76b42','#70452c','#c48853','#835331','#d95749','#f8ebce','#c8463e','#d4b385','#d0b389','#6c462c','#fff2d5','#cf9a52'],
 'forest':['#80583b','#573924','#ac7950','#66432e','#648c57','#f0e8cc','#527849','#cfb391','#c9b493','#61442d','#f7edd0','#b4a065'],
 'mountain':['#846347','#5c4635','#ae8761','#72533a','#557fa6','#f4efe2','#406992','#d6c3a6','#c9bdad','#5b473a','#f7f0e0','#8096af'],
 'marsh':['#7f735c','#5a5141','#a29475','#73634c','#ab9052','#e7ddba','#8e784a','#bca985','#ada394','#66553d','#f5e6c5','#bba25f'],
 'volcano':['#8b523b','#593729','#b77851','#714332','#bf6345','#f2d6a9','#a14e38','#d2ae89','#bda99a','#573c34','#ffe1b2','#d19a60']
}
# pos x horizontal, y vertical, z: FRONT is positive z. Vertex coordinates in meters.
class Builder:
 def __init__(self): self.groups=collections.defaultdict(list);self.tris=0
 def face(self,ps,category,part):
  # triangulates fan; double sided roof handled as separate face intentionally
  for k in range(1,len(ps)-1):
   a=np.array(ps[0],float);b=np.array(ps[k],float);c=np.array(ps[k+1],float)
   n=np.cross(b-a,c-a);l=np.linalg.norm(n)
   if l<1e-8:continue
   n=n/l
   for p in (a,b,c):self.groups[part].append((*p,*n,float(CAT[category])))
   self.tris+=1
 def box(self,x,y,z,w,h,d,c,part):
  x0,x1=x-w/2,x+w/2;y0,y1=y-h/2,y+h/2;z0,z1=z-d/2,z+d/2
  p=lambda X,Y,Z:(X,Y,Z)
  self.face([p(x0,y0,z1),p(x1,y0,z1),p(x1,y1,z1),p(x0,y1,z1)],c,part)
  self.face([p(x1,y0,z0),p(x0,y0,z0),p(x0,y1,z0),p(x1,y1,z0)],c,part)
  self.face([p(x0,y1,z1),p(x1,y1,z1),p(x1,y1,z0),p(x0,y1,z0)],c,part)
  self.face([p(x0,y0,z0),p(x1,y0,z0),p(x1,y0,z1),p(x0,y0,z1)],c,part)
  self.face([p(x1,y0,z1),p(x1,y0,z0),p(x1,y1,z0),p(x1,y1,z1)],c,part)
  self.face([p(x0,y0,z0),p(x0,y0,z1),p(x0,y1,z1),p(x0,y1,z0)],c,part)
 def beam(self,a,b,width,depth,c,part):
  # 4-sided prism with an oriented frame; round caps not required for wooden beams
  a=np.array(a,float);b=np.array(b,float);dv=b-a;ln=np.linalg.norm(dv)
  if ln<1e-6:return
  v=dv/ln
  trial=np.array([0,0,1.]) if abs(v[2])<.85 else np.array([0,1.,0])
  u=np.cross(v,trial);u/=np.linalg.norm(u);w=np.cross(v,u)
  offsets=[(u*width+w*depth)*s/2 for s in []]
  verts=[]
  for center in [a,b]:
   for su,sw in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append(tuple(center + su*u*width/2 + sw*w*depth/2))
  for i in range(4): j=(i+1)%4; self.face([verts[i],verts[j],verts[j+4],verts[i+4]],c,part)
  self.face([verts[3],verts[2],verts[1],verts[0]],c,part)
  self.face([verts[4],verts[5],verts[6],verts[7]],c,part)
 def rod(self,a,b,r,c,part,sides=6):
  a=np.array(a,float);b=np.array(b,float);d=b-a;l=np.linalg.norm(d)
  if l<1e-8:return
  v=d/l;u=np.cross(v,[0,1,0]) if abs(v[1])<.91 else np.cross(v,[1,0,0]);u/=np.linalg.norm(u);w=np.cross(v,u)
  ring=lambda q:[tuple(q+r*(math.cos(i*2*math.pi/sides)*u+math.sin(i*2*math.pi/sides)*w)) for i in range(sides)]
  aa,bb=ring(a),ring(b)
  for i in range(sides): j=(i+1)%sides;self.face([aa[i],aa[j],bb[j],bb[i]],c,part)
  self.face(aa[::-1],c,part);self.face(bb,c,part)
 def prism_xy(self,x,y,z,vertices,c,part,depth=.07):
  pts=[(x+vx,y+vy) for vx,vy in vertices]
  front=[(a,b,z+depth/2) for a,b in pts];back=[(a,b,z-depth/2) for a,b in pts]
  for i in range(1,len(pts)-1):
   self.face([front[0],front[i],front[i+1]],c,part)
   self.face([back[0],back[i+1],back[i]],c,part)
  for i in range(len(pts)):
   j=(i+1)%len(pts);self.face([front[i],back[i],back[j],front[j]],c,part)


# Level 2 trade CABIN: real enclosing wooden walls, rigid pitched planked roof,
# recessed service hatch, discrete fabric awning, rear access door and free NPC area.
# Same materials, crates, logo geometry, scales and palette mapping as approved N1.
B=Builder()
W='walls'; R='roof'; A='awning'; C='counter'; CR='crates'; S='sign'; D='door'; F='floor'; G='guide'
# Dimensions: wall footprint 2.75 x 2.45 m; roof 3.3 x 3.12 m;
# stand N1 already 3.0 x 2.3 m incl canvas, N2 slightly sturdier/larger.
FRONT=1.16; REAR=-1.15; RIGHT=1.34; LEFT=-1.34; WALL_TOP=2.32
# Low raised board floor and plain timber sill; body is not a massive stone building.
B.box(0,.10,0,2.79,.20,2.48,'wood_dark',F)
for i in range(10):
 x=-1.25+i*.277
 B.box(x,.214,0,.268,.035,2.38,'wood_light',F)
B.box(0,.20,FRONT,2.84,.15,.14,'wood_dark',F)
for x in (LEFT,RIGHT):B.box(x,.20,0,.14,.16,2.55,'wood_dark',F)
# Foundation corners; posts shared with N1 silhouette but more substantial and load-bearing.
for x in (LEFT,RIGHT):
 for z in (FRONT,REAR):
  B.box(x,1.20,z,.18,2.4,.18,'wood',W)
  B.box(x,.19,z,.27,.20,.28,'wood_dark',W)
  B.box(x,2.35,z,.22,.13,.22,'wood_edge',W)
# front wall: open *real* rectangular service hatch between x -.91.. .91, y1.14..2.06
# planking vertical with top and bottom segments, no invisible obstruction in hatch.
def vertical_planks_z(z,xlo,xhi,ylo,yhi,n=6,cat='wood',part=W):
 if yhi-ylo<.01:return
 interval=(xhi-xlo)/n
 for k in range(n):
  xx=xlo+(k+.5)*interval
  B.box(xx,(ylo+yhi)/2,z,interval-.012,yhi-ylo,.085,cat if k%5 else 'wood_light',part)
  if k%3==0 and yhi-ylo>.22:
   B.rod([xx,(ylo+yhi)/2,z+.052],[xx,(ylo+yhi)/2,z+.059],.009,'metal',part,4)
vertical_planks_z(FRONT,-1.24,1.24,.29,1.12,11)
vertical_planks_z(FRONT,-1.24,-.93,1.12,2.15,2)
vertical_planks_z(FRONT,.93,1.24,1.12,2.15,2)
vertical_planks_z(FRONT,-1.24,1.24,2.15,2.31,11)
# timber framing for guichet. Fully OPEN gap; shutter can be added later.
B.box(0,1.135,FRONT+.065,1.95,.105,.15,'wood_edge',W)
B.box(0,2.055,FRONT+.065,1.95,.10,.15,'wood_dark',W)
for x in (-.965,.965):B.box(x,1.60,FRONT+.065,.105,.95,.15,'wood_edge',W)
# roof-gable front and rear triangles closed in wooden slats (not canvas).
for z in (FRONT,REAR):
 for i in range(8):
  xa=-1.245+i*(2.49/8); xb=xa+2.49/8
  topA=2.33+.71*(1-abs(xa)/1.38);topB=2.33+.71*(1-abs(xb)/1.38)
  # gable is a triangular wooden panel rising above the top of the wall.
  B.face([(xa,2.32,z),(xb,2.32,z),(xb,topB,z),(xa,topA,z)],'wood_light' if i%4==1 else 'wood',W)
  B.face([(xa,topA,z-.035),(xb,topB,z-.035),(xb,2.32,z-.035),(xa,2.32,z-.035)],'wood',W)
 B.beam([0,3.05,z+.07],[0,2.32,z+.07],.10,.10,'wood_dark',W)
# side walls: rigid planks; left window in wall, right plain with a cross brace.
def side_planking(x,zlo,zhi,ylo,yhi,n=6):
 step=(zhi-zlo)/n
 for i in range(n):
  z=zlo+(i+.5)*step
  B.box(x,(ylo+yhi)/2,z,.085,yhi-ylo,step-.015,'wood_light' if i%6==1 else 'wood',W)
# left-side window (real cutout) at z from -.52..+.21, 1.20..1.95
for x in [LEFT]:
 side_planking(x,REAR+.095,-.55,.29,2.30,3)
 side_planking(x,-.55,.22,.29,1.16,4)
 side_planking(x,-.55,.22,1.96,2.30,4)
 side_planking(x,.22,FRONT-.095,.29,2.30,4)
 # wooden crossbar frame, optional shutter open, no glass / texture.
 for z in (-.57,.24):B.box(x-.068,1.56,z,.13,.82,.08,'wood_edge',W)
 B.box(x-.068,1.14,-.16,.13,.085,.82,'wood_edge',W)
 B.box(x-.068,1.98,-.16,.13,.085,.82,'wood_edge',W)
 # hinged shutter swung outward (not blocking open gap)
 B.box(x-.26,1.58,.30,.12,.78,.61,'wood_dark',W)
 for zi in (.05,.5):B.box(x-.18,1.58,zi,.03,.67,.03,'wood_edge',W)
# right side wall complete, details to appear continuous.
side_planking(RIGHT,REAR+.095,FRONT-.095,.29,2.30,10)
# rear wall with truly open door aperture x +.22 to +1.02, y .25..2.12
vertical_planks_z(REAR,-1.24,.20,.29,2.30,7)
vertical_planks_z(REAR,1.07,1.24,.29,2.30,1)
vertical_planks_z(REAR,.20,1.07,2.12,2.30,4)
# door jamb surrounds opening; wooden hinged door model is set swung open at right side.
for x in (.18,1.09):B.box(x,1.17,REAR-.06,.105,1.90,.15,'wood_edge',D)
B.box(.635,2.13,REAR-.06,1.04,.095,.14,'wood_dark',D)
# door panel OPEN on outside, hinge x=1.06; sweeps outward and sideways, does not seal doorway.
B.box(1.32,1.17,REAR-.39,.55,1.72,.08,'wood_light',D)
for yy in (.46,1.81):B.box(1.30,yy,REAR-.45,.48,.06,.06,'wood_dark',D)
B.beam([1.12,.38,REAR-.46],[1.49,1.80,REAR-.46],.055,.065,'wood_dark',D)
B.rod([1.1,1.15,REAR-.48],[1.10,1.15,REAR-.43],.035,'metal',D,8)
# Architraves, rails and joinery, mostly simple low poly boards
for z in (FRONT,REAR):
 B.box(0,2.30,z,2.60,.125,.16,'wood_dark',W)
 B.box(0,.30,z,2.6,.10,.16,'wood_edge',W)
for x in (LEFT,RIGHT):
 B.box(x,2.32,0,.15,.12,2.36,'wood_dark',W)
 B.box(x,.30,0,.13,.10,2.36,'wood_dark',W)
# side diagonal braces on right wall, intentionally chunky, readable.
for z0,z1 in [(-1.03,-.10),(.10,1.03)]:
 B.beam([RIGHT+.065,.37,z0],[RIGHT+.065,2.18,z1],.075,.055,'wood_edge',W)
# gable supports + front corner braces, coherent with N1.
for x in (LEFT,RIGHT):
 B.beam([x,1.91,FRONT+.11],[x+(.35 if x<0 else -.35),2.28,FRONT+.11],.082,.09,'wood_edge',W)
# Rigid wooden pitched roof, ridge running along Z; overhang front and sides.
roof_front=1.49;roof_back=-1.47
roof_peak=3.18;roof_eave=2.21
roof_edge=1.63
# flat boards in 5 courses down each side; actual thickness, correct overlap along slope.
for side in (-1,1):
 for step in range(5):
  xa=side*(step/5*roof_edge)
  xb=side*((step+1)/5*roof_edge)
  ya=roof_peak-(step/5)*(roof_peak-roof_eave)
  yb=roof_peak-((step+1)/5)*(roof_peak-roof_eave)
  # each roof has longitudinal boards; break along Z into 7 manageable planks with slight overlaps.
  for iz in range(7):
   za=roof_back+(roof_front-roof_back)*iz/7
   zb=roof_back+(roof_front-roof_back)*(iz+1)/7
   col='wood_dark' if (step+iz)%7 else 'wood_edge'
   p=[(xa,ya,za),(xb,yb,za),(xb,yb,zb),(xa,ya,zb)]
   B.face(p,col,R);B.face(p[::-1],col,R)
   # bit of wood thickness at lower course edge
   if step==4:B.face([(xb,yb,za),(xb,yb,zb),(xb,yb-.052,zb),(xb,yb-.052,za)],'wood_edge',R)
  # highlight each plank course via very subtle strips, without costly overlay textures
  B.beam([xb,yb,roof_back],[xb,yb,roof_front],.017,.018,'wood_edge',R)
 # sloping exposed beam at front/end near eaves
 B.beam([0,roof_peak,roof_front],[side*roof_edge,roof_eave,roof_front],.115,.11,'wood_edge',R)
 B.beam([0,roof_peak,roof_back],[side*roof_edge,roof_eave,roof_back],.105,.10,'wood_dark',R)
 # fascia side
 B.beam([side*roof_edge,roof_eave,roof_back],[side*roof_edge,roof_eave,roof_front],.095,.105,'wood_edge',R)
B.beam([0,roof_peak+.035,roof_back-.07],[0,roof_peak+.035,roof_front+.07],.15,.14,'wood_edge',R)
# triangular shadowed under-eave supports over front window
for x in (-1.02,1.02):B.beam([x,2.05,1.17],[x,2.23,1.45],.085,.09,'wood_dark',R)
# Compact striped awning *secondary*, repeats N1 fabric identity but NOT the building roof.
# support small angled side struts, open underneath
for x in (-.99,.99):B.beam([x,2.07,1.20],[x,1.85,1.68],.065,.072,'wood_edge',A)
NT=6;NX=7;xmin=-1.02;xmax=1.02
for band in range(NT):
 xa=xmin+(xmax-xmin)*band/NT;xb=xmin+(xmax-xmin)*(band+1)/NT
 cat='cloth_red' if band%2==0 else 'cloth_cream'
 def a_pos(x,t):
  return (x,2.13-.26*t-.035*math.sin(math.pi*t),1.17+.55*t)
 for i in range(NX):
  t=i/NX;u=(i+1)/NX
  quad=[a_pos(xa,t),a_pos(xb,t),a_pos(xb,u),a_pos(xa,u)]
  B.face(quad,cat,A);B.face(quad[::-1],cat,A)
 for i in range(3):
  xx=xa+(xb-xa)*i/3; yy=xa+(xb-xa)*(i+1)/3
  def hem(x):
   u=(x-xa)/(xb-xa)
   return (x,1.87-.12-.06*(1-(2*u-1)**2),1.735)
  v=[a_pos(xx,1),a_pos(yy,1),hem(yy),hem(xx)]
  B.face(v,cat,A);B.face(v[::-1],cat,A)
B.rod([-1.04,1.865,1.723],[1.04,1.865,1.723],.028,'wood_edge',A,6)
# main guichet counter at y1.13, external depth to z1.49
B.box(0,1.14,1.32,2.08,.12,.52,'wood_light',C)
for i in range(6):
 x=-.91+i*.365
 B.box(x,1.206,1.33,.009,.01,.50,'wood_edge',C)
B.box(0,1.00,1.565,2.18,.065,.10,'wood_edge',C)
for x in (-.89,.89):
 B.beam([x,.60,1.16],[x,1.11,1.50],.10,.085,'wood_dark',C)
# lower facade external timber cladding, decorative diagonal in N1's style
B.beam([-.96,.35,1.27],[-.15,1.05,1.27],.08,.06,'wood_edge',C)
B.beam([.96,.35,1.27],[.15,1.05,1.27],.08,.06,'wood_edge',C)
for x,y in [(-.95,.36),(-.13,1.04),(.95,.36),(.13,1.04)]:B.rod([x,y,1.325],[x,y,1.36],.023,'metal',C,6)
# Interior shelf on left, room remains open near hatch for PNJ.
B.box(-.86,.68,-.57,.42,.075,.42,'wood_light',C)
for zz in (-.76,-.38):B.box(-.87,.43,zz,.09,.54,.09,'wood_dark',C)
# Re-used N1 empty crate recipe; no merchandise represented.
def crate(x,y,z,s):
 wd=.08*s
 B.box(x,y+s*.06,z,s,.12*s,s,'wood_dark',CR)
 for sx in (-1,1):
  for sz in (-1,1):B.box(x+sx*(s/2-wd/2),y+s/2,z+sz*(s/2-wd/2),wd,s,wd,'wood_edge',CR)
 for direction in (-1,1):
  B.box(x,y+s*.45,z+direction*(s/2-wd*.78),s*.80,s*.53,s*.036,'wood',CR)
  B.box(x+direction*(s/2-wd*.78),y+s*.45,z,s*.036,s*.53,s*.80,'wood',CR)
 for sz in (-1,1):
  for q in (.17,.77):B.box(x,y+s*q,z+sz*(s/2-wd/2),s,.09*s,.068*s,'wood',CR)
 for sx in (-1,1):
  for q in (.17,.77):B.box(x+sx*(s/2-wd/2),y+s*q,z,.068*s,.09*s,s,'wood',CR)
 B.beam([x-s*.34,y+s*.22,z+s*.52],[x+s*.34,y+s*.72,z+s*.52],.075*s,.06*s,'wood_light',CR)
 B.beam([x+s*.34,y+s*.22,z-s*.52],[x-s*.34,y+s*.72,z-s*.52],.075*s,.06*s,'wood_light',CR)
crate(-.90,.23,-.70,.47)
crate(-.90,.70,-.70,.37)
crate(1.71,0,.33,.46)
# Identical N1 hex/cube signature: placed RIGHT of storefront, no dependence on merchandise.
# support cantilever at front right (the roof is at 2.2m on the edges).
B.beam([1.34,2.13,1.19],[1.93,2.13,1.19],.12,.12,'wood_dark',S)
B.beam([1.35,1.89,1.19],[1.52,2.11,1.19],.075,.08,'wood_edge',S)
for x in (1.58,1.84):B.rod([x,2.12,1.25],[x,1.98,1.25],.017,'rope',S,6)
cx,cy=1.71,1.69
hexes=[(math.cos(math.pi/6+i*math.pi/3)*.310,math.sin(math.pi/6+i*math.pi/3)*.310) for i in range(6)]
B.prism_xy(cx,cy,1.30,hexes,'wood_dark',S,.068)
B.prism_xy(cx,cy,1.348,[(a*.88,b*.88) for a,b in hexes],'logo',S,.02)
B.prism_xy(cx,cy,1.363,[(a*.78,b*.78) for a,b in hexes],'panel',S,.014)
fx=lambda dx,dy:(cx+dx,cy+dy,1.383)
logo_edges=[((-0.126,.068),(0,.142)),((0,.142),(.13,.066)),((.13,.066),(0,-.015)),((0,-.015),(-.126,.068)),((-0.126,.068),(-.126,-.102)),((.13,.066),(.13,-.102)),((0,-.015),(0,-.183)),((-0.126,-.102),(0,-.183)),((.13,-.102),(0,-.183)),((-0.07,.092),(.058,.018)),((.058,.018),(.058,-.058))]
for a,b in logo_edges:B.rod(fx(*a),fx(*b),.011,'logo',S,5)
# Viewer guide for vendor (not exported). Cabin interior approx x=-.90..+.93, z=-.96..+.80
for i in range(24):
 a=2*math.pi*i/24;b=2*math.pi*(i+0.60)/24
 B.rod([.19+.37*math.cos(a),.251,.05+.34*math.sin(a)],[.19+.37*math.cos(b),.251,.05+.34*math.sin(b)],.010,'accent',G,4)
# Footprint in viewer only
for a,b in [((-1.36,.026,-1.16),(1.36,.026,-1.16)),((1.36,.026,-1.16),(1.36,.026,1.16)),((1.36,.026,1.16),(-1.36,.026,1.16)),((-1.36,.026,1.16),(-1.36,.026,-1.16))]:B.rod(a,b,.007,'accent',G,4)

# GLB with vertex color under the tropical palette by default, grouped by meaningful meshes.
scene=trimesh.Scene()
for part,arr in B.groups.items():
 if part=='guide':continue
 data=np.asarray(arr,dtype=np.float32)
 verts=data[:,:3].reshape(-1,3);faces=np.arange(len(verts),dtype=np.int64).reshape(-1,3)
 pal=PALETTES['tropical'];colors=np.asarray([[*bytes.fromhex(pal[int(round(k))].lstrip('#')),255] for k in data[:,6]],dtype=np.uint8)
 mesh=trimesh.Trimesh(vertices=verts,faces=faces,process=False)
 mesh.visual.vertex_colors=colors
 scene.add_geometry(mesh,geom_name=part,node_name=part)
file=OUT/'little-world-port-trade-N2-v1.glb'
file.write_bytes(scene.export(file_type='glb'))
print('GLB:',file,file.stat().st_size,'bytes;',B.tris,'triangles', {k:len(v)//3 for k,v in B.groups.items()})
raw={p:base64.b64encode(np.asarray(a,dtype='<f4').tobytes()).decode('ascii') for p,a in B.groups.items()}
html=(OUT/'template_port_trade_n2.html').read_text()
html=html.replace('__EMBEDDED_GEOMETRY__',json.dumps(raw,separators=(',',':')))
html=html.replace('__PALETTES__',json.dumps(PALETTES,separators=(',',':')))
html=html.replace('__GLB_BASE64__',base64.b64encode(file.read_bytes()).decode('ascii'))
html=html.replace('__MODEL_STATS__',json.dumps({'triangles':sum(len(v)//3 for k,v in B.groups.items() if k!='guide'),'parts':{k:len(v)//3 for k,v in B.groups.items()},'dimensions':'≈ 3.7 × 3.1 × 3.2 m','model':'Little World trade cabin N2 / V1'},ensure_ascii=False))
out_html=OUT/'little-world-stand-N2-lowpoly-3d.html';out_html.write_text(html,encoding='utf-8')
print('HTML',out_html.stat().st_size)