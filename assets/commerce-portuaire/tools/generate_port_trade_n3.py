"""Generate Little World N2 wooden trade cabin GLB and offline WebGL viewer, following approved N1.
Geometry intentionally authored from closed simple low-poly primitives, no purchased assets.
"""
from __future__ import annotations
import base64, math, json, struct, collections, pathlib, textwrap, os
import numpy as np
import trimesh

OUT=pathlib.Path(os.environ.get('PORT_TRADE_OUT', pathlib.Path.cwd()))
OUT.mkdir(parents=True, exist_ok=True)
TEMPLATE=pathlib.Path(__file__).with_name('template_port_trade_n3.html')
CATEGORIES=['wood','wood_dark','wood_light','wood_edge','cloth_red','cloth_cream','cloth_seam','rope','metal','panel','logo','accent','stone','stone_light','stone_dark','tile','tile_dark','mortar']
CAT={v:i for i,v in enumerate(CATEGORIES)}
PALETTES={
 'tropical':['#a76b42','#70452c','#c48853','#835331','#d95749','#f8ebce','#c8463e','#d4b385','#a9977f','#6c462c','#fff2d5','#cf9a52','#c5b7a0','#dfd1b7','#9b8c79','#b95e45','#85412f','#948472'],
 'forest':['#80583b','#573924','#ac7950','#66432e','#648c57','#f0e8cc','#527849','#cfb391','#a8a29a','#61442d','#f7edd0','#b4a065','#aaa89b','#cbc9b8','#858578','#935b46','#704b3a','#838276'],
 'mountain':['#846347','#5c4635','#ae8761','#72533a','#557fa6','#f4efe2','#406992','#d6c3a6','#a9a5a0','#5b473a','#f7f0e0','#8096af','#969da3','#bfc4c6','#747d85','#687b91','#46586d','#6e7780'],
 'marsh':['#7f735c','#5a5141','#a29475','#73634c','#ab9052','#e7ddba','#8e784a','#bca985','#ada394','#66553d','#f5e6c5','#bba25f','#a39e84','#c8c0a0','#7e7a64','#94845e','#70634b','#7c7864'],
 'volcano':['#8b523b','#593729','#b77851','#714332','#bf6345','#f2d6a9','#a14e38','#d2ae89','#bda99a','#573c34','#ffe1b2','#d19a60','#555157','#767077','#38383d','#974f3b','#623a33','#433f45']
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


# Level 3: small STONE/BRICK permanent trade building. Same family as accepted N1/N2,
# contrasting genuine masonry body with a wooden rigid tile roof and the familiar awning/logo.
# Axis: +Z front (service window); Y=0 ground; X horizontal.
B=Builder()
F='foundation'; M='masonry'; T='trim'; R='roof'; A='awning'; C='counter'; CR='crates'; S='sign'; D='door'; G='guide'
WALL_X=1.70; FRONT=1.46; REAR=-1.46; EAVE=2.52; PEAK=3.58
# Strong permanent foundation and stone footing (not a huge dock/platform).
B.box(0,.115,0,3.67,.23,3.20,'stone_dark',F)
B.box(0,.245,0,3.57,.11,3.10,'stone',F)
for x in (-1.58,1.58):
 for z in (FRONT,REAR):
  B.box(x,.17,z,.24,.33,.24,'stone_light',F)
# Three-course wide-stone blocks with genuine depth; gaps between blocks show darker mortar.
# Project stones only over filled regions, cutting genuine service-window/door/window openings.
# Row boundaries align with the front sales guichet and rear door lintel.
rows=[(.29,.62,0),(.62,.96,1),(.96,1.27,0),(1.27,1.58,1),(1.58,1.9,0),(1.9,2.17,1),(2.17,2.48,0)]
# leave sliver of masonry backing to ensure no see-through hairlines between courses.
def front_blocks(z, back=False):
 for r,(y0,y1,shift) in enumerate(rows):
  h=y1-y0
  n=8
  span=3.16/n
  for i in range(n):
   x=-1.58+(i+.5)*span
   # Front guichet: x [-1.08,1.08] and y [1.15,2.13], actual opening.
   if not back and (y1>1.16 and y0<2.13) and -1.08<x<1.08:continue
   # Rear staff door: x [0.20,1.12], y [0.28,2.12].
   if back and y0<2.16 and (x+span/2)>.19 and (x-span/2)<1.13:continue
   # stone units as individual lightly variegated projecting blocks; no texture needed.
   cat=['stone','stone_light','stone','stone','stone_dark'][(i*7+r*3)%5]
   B.box(x,(y0+y1)/2,z,span-.015,h-.016,.182,cat,M)
front_blocks(FRONT);front_blocks(REAR,True)
# Dark recessed mortar/core panels: joints are not windows through the building.
# Four shallow masonry panels build the front opening, the rear doorway, and the left window.
# Their interiors remain genuinely hollow where service/person flow is required.
def wall_panel_z(z,x0,x1,y0,y1):
 if x1>x0 and y1>y0:B.box((x0+x1)/2,(y0+y1)/2,z-.12,x1-x0,y1-y0,.10,'mortar',M)
wall_panel_z(FRONT,-1.61,1.61,.29,1.14)
wall_panel_z(FRONT,-1.61,-1.11,1.14,2.16)
wall_panel_z(FRONT,1.11,1.61,1.14,2.16)
wall_panel_z(FRONT,-1.61,1.61,2.16,2.50)
wall_panel_z(REAR,-1.61,.15,.29,2.15)
wall_panel_z(REAR,1.19,1.61,.29,2.15)
wall_panel_z(REAR,-1.61,1.61,2.15,2.50)
# Side wall mortar is recessed towards interior (+X on the left wall, -X on the right).
def wall_panel_side(x,z0,z1,y0,y1):
 xx=x+.12 if x<0 else x-.12
 B.box(xx,(y0+y1)/2,(z0+z1)/2,.105,y1-y0,z1-z0,'mortar',M)
wall_panel_side(-WALL_X,-1.40,1.40,.29,1.31)
wall_panel_side(-WALL_X,-1.40,-.53,1.31,2.05)
wall_panel_side(-WALL_X,.37,1.40,1.31,2.05)
wall_panel_side(-WALL_X,-1.40,1.40,2.05,2.50)
wall_panel_side(WALL_X,-1.40,1.40,.29,2.50)
# The doorway/window outlines are true empty holes, not dark rectangles painted on a solid wall.
# Side walls run from rear to front; left side has a compact real window.
def side_wall(x, left=False):
 n=8; dz=2.75/n
 for r,(y0,y1,shift) in enumerate(rows):
  h=y1-y0
  for i in range(n):
   z=-1.375+(i+.5)*dz
   # Left window from z -.48..+.32, height 1.33..1.99
   if left and y1>1.33 and y0<2.00 and -.50<z<.33:continue
   cat=['stone','stone','stone_light','stone_dark','stone'][(i*3+r*5+i//3)%5]
   B.box(x,(y0+y1)/2,z,.185,h-.016,dz-.014,cat,M)
side_wall(-WALL_X,True);side_wall(WALL_X,False)
# Corner stones with alternating protrusion: important silhouette of a masonry building.
for x in (-WALL_X,WALL_X):
 for z in (FRONT,REAR):
  for j,(y0,y1,_) in enumerate(rows):
   B.box(x,(y0+y1)/2,z,.255,y1-y0-.018,.255,'stone_light' if j%3==0 else 'stone',M)
# Compact raised door sill and front guichet ledge, masonry lintels.
B.box(0,1.132,FRONT+.14,2.28,.155,.34,'stone_light',M)
B.box(0,2.168,FRONT+.04,2.27,.185,.27,'stone_light',M)
B.box(-1.105,1.65,FRONT+.04,.17,1.02,.245,'stone_light',M)
B.box(1.105,1.65,FRONT+.04,.17,1.02,.245,'stone_light',M)
B.box(.66,2.18,REAR-.04,1.14,.18,.23,'stone_light',M)
for x in (.13,1.18): B.box(x,1.225,REAR-.10,.17,1.90,.24,'stone_light',M)
# Side window stone sill/lintel + wood window framing; open pane, not glass.
B.box(-WALL_X-.09,1.31,-.105,.31,.095,.98,'stone_light',M)
B.box(-WALL_X-.09,2.03,-.105,.31,.095,.98,'stone_light',M)
for z in (-.53,.34):B.box(-WALL_X-.11,1.65,z,.25,.74,.11,'wood_edge',T)
# Top plates and recessed wood lintel, preserving N1/2 joinery language.
B.box(0,2.34,FRONT+.135,2.17,.10,.14,'wood_dark',T)
for x in (-1.08,1.08):B.box(x,1.64,FRONT+.135,.10,1.02,.13,'wood_edge',T)
# Foyer floor is clear behind the serving opening. Subtle dry-board floor, no large platform.
for i in range(11):
 x=-1.48+(i+.5)*2.96/11
 B.box(x,.320,0,2.96/11-.016,.035,2.72,'wood_light',F)
# Rear hinged timber door, actually swung open OUTSIDE and away from aperture.
B.box(1.45,1.20,REAR-.43,.46,1.72,.095,'wood_light',D)
for y in (.45,1.95):B.box(1.45,y,REAR-.49,.40,.065,.07,'wood_dark',D)
B.beam([1.27,.4,REAR-.49],[1.65,1.95,REAR-.49],.060,.068,'wood_dark',D)
B.rod([1.24,1.19,REAR-.53],[1.24,1.19,REAR-.46],.033,'metal',D,6)
# True pitched roof with terracotta-colored tile geometry. Wooden rafters visible under eaves.
EDGE=1.98;zf=1.83;zb=-1.80
for side in (-1,1):
 B.beam([0,PEAK,zf],[side*EDGE,EAVE,zf],.125,.15,'wood_dark',R)
 B.beam([0,PEAK,zb],[side*EDGE,EAVE,zb],.12,.14,'wood_dark',R)
 for z in (zb,zf):B.beam([side*1.71,2.68,z],[side*EDGE,EAVE,z],.10,.12,'wood_edge',R)
 # board-like tiles form 6 staggered courses, 9 rows along ridge; raised lip and valley color.
 for course in range(6):
  x0=side*EDGE*course/6;x1=side*EDGE*(course+1)/6
  y0=PEAK-(PEAK-EAVE)*course/6;y1=PEAK-(PEAK-EAVE)*(course+1)/6
  for j in range(9):
   zz0=zb+j*(zf-zb)/9;zz1=zb+(j+1)*(zf-zb)/9
   cat='tile' if (j+course)%5 else 'tile_dark'
   poly=[(x0,y0+.014,zz0+.010),(x1,y1+.014,zz0+.010),(x1,y1+.014,zz1-.010),(x0,y0+.014,zz1-.010)]
   B.face(poly,cat,R);B.face(poly[::-1],cat,R)
   # slight row overlap, as a tile flap, without adding complex mesh.
   B.face([(x1,y1+.020,zz0+.007),(x1,y1+.020,zz1-.007),(x1,y1-.038,zz1-.007),(x1,y1-.038,zz0+.007)],'tile_dark',R)
 B.beam([side*EDGE,EAVE,zb],[side*EDGE,EAVE,zf],.09,.105,'wood_edge',R)
 # slim rafter under tile: no detailed visible ceiling geometry
 B.beam([0,PEAK-.14,zb+.15],[side*EDGE,EAVE-.11,zb+.15],.09,.13,'wood_dark',R)
 B.beam([0,PEAK-.14,zf-.15],[side*EDGE,EAVE-.11,zf-.15],.09,.13,'wood_dark',R)
B.beam([0,PEAK+.06,zb-.10],[0,PEAK+.06,zf+.10],.15,.15,'tile_dark',R)
# Gable triangles are masonry and sit below the pitched tile roof; there should be no open cavity.
# Readable pitched silhouette thanks to large light stone segments.
for z in (REAR,FRONT):
 for i in range(12):
  xa=-1.7+i*3.4/12;xb=xa+3.4/12
  h=lambda x:2.5+(PEAK-2.5)*(1-abs(x)/1.98)
  B.face([(xa,2.47,z),(xb,2.47,z),(xb,h(xb)-.13,z),(xa,h(xa)-.13,z)], 'stone_light' if i%5==0 else 'stone',M)
  B.face([(xa,h(xa)-.13,z-.07),(xb,h(xb)-.13,z-.07),(xb,2.47,z-.07),(xa,2.47,z-.07)],'stone_dark',M)
 B.beam([0,3.40,z+.14],[0,2.48,z+.14],.095,.11,'wood_dark',T)
# Compact striped fabric awning for the SAME trade family identity, but not structural roof.
for x in (-1.23,1.23): B.beam([x,2.25,FRONT+.17],[x,1.98,FRONT+.76],.073,.083,'wood_edge',A)
nBand=8
for i in range(nBand):
 xa=-1.25+2.50*i/nBand;xb=-1.25+2.50*(i+1)/nBand
 cat='cloth_red' if i%2==0 else 'cloth_cream'
 def p(x,t):return (x,2.31-.27*t-.045*math.sin(math.pi*t),FRONT+.16+.65*t)
 for k in range(7):
  t=k/7;u=(k+1)/7
  quad=[p(xa,t),p(xb,t),p(xb,u),p(xa,u)]
  B.face(quad,cat,A);B.face(quad[::-1],cat,A)
 for k in range(3):
  a=xa+(xb-xa)*k/3;b=xa+(xb-xa)*(k+1)/3
  v=[p(a,1),p(b,1),(b,1.92-.065*(1-abs(2*k/3-1)),FRONT+.85),(a,1.92-.065*(1-abs(2*(k+1)/3-1)),FRONT+.85)]
  B.face(v,cat,A);B.face(v[::-1],cat,A)
B.rod([-1.26,2.035,FRONT+.81],[1.26,2.035,FRONT+.81],.030,'wood_edge',A)
# Substantial empty wooden counter, structurally supported by masonry lower wall.
B.box(0,1.17,FRONT+.27,2.43,.14,.62,'wood_light',C)
B.box(0,1.06,FRONT+.53,2.50,.075,.11,'wood_edge',C)
for x in (-1.10,1.10):B.beam([x,.54,FRONT+.13],[x,1.13,FRONT+.53],.105,.09,'wood_dark',C)
for i in range(7):
 xx=-1.01+(i+.5)*2.02/7
 B.box(xx,1.248,FRONT+.27,.012,.010,.58,'wood_edge',C)
# Small interior service shelf on rear left only, without obstructing staff clearance.
B.box(-1.30,.71,-.89,.45,.085,.50,'wood_light',C)
for z in (-1.09,-.70):B.box(-1.30,.48,z,.10,.48,.10,'wood_dark',C)
# Three empty crates reusing N2's visual language, not merchandise.
def crate(x,y,z,s):
 wd=.075*s
 B.box(x,y+s*.055,z,s,.11*s,s,'wood_dark',CR)
 for sx in (-1,1):
  for sz in (-1,1): B.box(x+sx*(s/2-wd/2),y+s/2,z+sz*(s/2-wd/2),wd,s,wd,'wood_edge',CR)
 for side in (-1,1):
  B.box(x,y+s*.47,z+side*(s/2-wd*.78),s*.82,s*.49,s*.035,'wood',CR)
  B.box(x+side*(s/2-wd*.78),y+s*.47,z,s*.035,s*.49,s*.82,'wood',CR)
 for q in (.18,.79):
  for side in (-1,1):
   B.box(x,y+s*q,z+side*(s/2-wd/2),s,.095*s,.070*s,'wood_edge',CR)
   B.box(x+side*(s/2-wd/2),y+s*q,z,.070*s,.095*s,s,'wood_edge',CR)
 B.beam([x-s*.35,y+s*.23,z+s*.54],[x+s*.35,y+s*.73,z+s*.54],.070*s,.060*s,'wood_light',CR)
 B.beam([x+s*.35,y+s*.23,z-s*.54],[x-s*.35,y+s*.73,z-s*.54],.070*s,.060*s,'wood_light',CR)
crate(-1.15,.31,-.98,.49)
crate(-1.15,.80,-.98,.36)
crate(2.06,0,.15,.48)
# Shared trade insignia: hexagonal hanging sign, wooden crate line art, no letters/texture.
B.beam([1.65,2.30,1.49],[2.32,2.30,1.49],.14,.14,'wood_dark',S)
B.beam([1.68,2.03,1.49],[1.89,2.27,1.49],.09,.09,'wood_edge',S)
for x in (1.95,2.18):B.rod([x,2.31,1.57],[x,2.04,1.57],.020,'rope',S,6)
cx,cy=2.08,1.73
hexes=[(math.cos(math.pi/6+i*math.pi/3)*.338,math.sin(math.pi/6+i*math.pi/3)*.338) for i in range(6)]
B.prism_xy(cx,cy,1.57,hexes,'wood_dark',S,.082)
B.prism_xy(cx,cy,1.625,[(a*.89,b*.89) for a,b in hexes],'logo',S,.03)
B.prism_xy(cx,cy,1.649,[(a*.77,b*.77) for a,b in hexes],'panel',S,.02)
fx=lambda dx,dy:(cx+dx,cy+dy,1.670)
logo_edges=[((-.136,.078),(0,.156)),((0,.156),(.14,.078)),((.14,.078),(0,-.020)),((0,-.020),(-.136,.078)),((-.136,.078),(-.136,-.115)),((.14,.078),(.14,-.115)),((0,-.020),(0,-.198)),((-.136,-.115),(0,-.198)),((.14,-.115),(0,-.198)),((-.075,.10),(.060,.026)),((.060,.026),(.060,-.066))]
for a,b in logo_edges:B.rod(fx(*a),fx(*b),.0115,'logo',S,5)
# STAFF CLEARANCE: only viewer guide; never exported to GLB.
for i in range(24):
 a=2*math.pi*i/24;b=2*math.pi*(i+.62)/24
 B.rod([.02+.42*math.cos(a),.35,-.24+.41*math.sin(a)],[.02+.42*math.cos(b),.35,-.24+.41*math.sin(b)],.010,'accent',G,4)
# glTF 2.0 binary with separate named mesh parts, vertex colors (no texture).
scene=trimesh.Scene()
for part,arr in B.groups.items():
 if part=='guide':continue
 data=np.asarray(arr,dtype=np.float32)
 vertices=data[:,:3].reshape(-1,3)
 faces=np.arange(len(vertices),dtype=np.int64).reshape(-1,3)
 pal=PALETTES['tropical']
 colors=np.asarray([[*bytes.fromhex(pal[int(round(k))].lstrip('#')),255] for k in data[:,6]],dtype=np.uint8)
 mesh=trimesh.Trimesh(vertices=vertices,faces=faces,process=False)
 mesh.visual.vertex_colors=colors
 scene.add_geometry(mesh,geom_name=part,node_name=part)
file=OUT/'little-world-port-trade-N3-candidate-v1.glb'
file.write_bytes(scene.export(file_type='glb'))
print('GLB:',file,file.stat().st_size,'bytes;',sum(len(v)//3 for k,v in B.groups.items() if k!='guide'),'triangles', {k:len(v)//3 for k,v in B.groups.items()})
raw={p:base64.b64encode(np.asarray(a,dtype='<f4').tobytes()).decode('ascii') for p,a in B.groups.items()}
html=TEMPLATE.read_text(encoding='utf-8')
html=html.replace('__EMBEDDED_GEOMETRY__',json.dumps(raw,separators=(',',':')))
html=html.replace('__PALETTES__',json.dumps(PALETTES,separators=(',',':')))
html=html.replace('__GLB_BASE64__',base64.b64encode(file.read_bytes()).decode('ascii'))
html=html.replace('__MODEL_STATS__',json.dumps({'triangles':sum(len(v)//3 for k,v in B.groups.items() if k!='guide'),'parts':{k:len(v)//3 for k,v in B.groups.items()},'dimensions':'≈ 4.5 × 3.9 × 3.6 m','model':'Little World stone trade building N3 / candidate V1'},ensure_ascii=False))
out_html=OUT/'little-world-stand-N3-lowpoly-3d.html';out_html.write_text(html,encoding='utf-8')
print('HTML',out_html.stat().st_size)
