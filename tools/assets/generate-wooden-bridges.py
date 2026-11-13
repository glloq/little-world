#!/usr/bin/env python3
"""Little World - reproducible original wooden bridges (Y up / meters / vertex colors)."""
from pathlib import Path
import hashlib, json, math
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1] if ROOT.name=='assets' and ROOT.parent.name=='tools' and (ROOT.parents[1]/'package.json').exists() else None
MODELS=(REPO/'public/models/structures/bridges') if REPO else (ROOT/'models')
MANIFEST_FILE=(REPO/'assets/structures/bridges/manifest.json') if REPO else (ROOT/'manifest.json')
C={
 'plank':(219,152,93),'plank_light':(233,169,109),'plank_warm':(208,137,77),
 'plank_edge':(178,108,61),'rail':(166,102,59),'rail_light':(188,119,71),
 'post':(161,98,58),'post_top':(217,146,85), 'support':(143,85,49),
 'log':(157,93,53),'log_light':(186,110,61),'log_end':(205,144,87),
 'log_end_ring':(151,88,50),'peg':(178,115,64), 'underside':(130,78,46)
}
class Builder:
 def __init__(self):self.v=[];self.f=[];self.colors=[];self.groups={}
 def quad(self,p,color,expected,group):
  p=np.asarray(p,dtype=float);exp=np.asarray(expected,dtype=float)
  n=np.cross(p[1]-p[0],p[2]-p[0])
  if np.linalg.norm(n)<1e-9:return
  if np.dot(n,exp)<0:p=p[[0,3,2,1]]
  off=len(self.v);self.v.extend(p.tolist());self.f.extend([[off,off+1,off+2],[off,off+2,off+3]])
  self.colors.extend([list(C[color])+[255]]*4);self.groups[group]=self.groups.get(group,0)+2
 def tri(self,p,color,expected,group):
  p=np.asarray(p,dtype=float);n=np.cross(p[1]-p[0],p[2]-p[0])
  if np.linalg.norm(n)<1e-9:return
  if np.dot(n,expected)<0:p=p[[0,2,1]]
  off=len(self.v);self.v.extend(p.tolist());self.f.append([off,off+1,off+2]);self.colors.extend([list(C[color])+[255]]*3)
  self.groups[group]=self.groups.get(group,0)+1
 def prism(self,a,b,col,group):
  x0,y0,z0=a;x1,y1,z1=b
  self.quad([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],col,(0,1,0),group)
  self.quad([(x0,y0,z1),(x1,y0,z1),(x1,y0,z0),(x0,y0,z0)],col,(0,-1,0),group)
  self.quad([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)],col,(0,0,-1),group)
  self.quad([(x0,y1,z1),(x1,y1,z1),(x1,y0,z1),(x0,y0,z1)],col,(0,0,1),group)
  self.quad([(x0,y0,z1),(x0,y0,z0),(x0,y1,z0),(x0,y1,z1)],col,(-1,0,0),group)
  self.quad([(x1,y0,z0),(x1,y0,z1),(x1,y1,z1),(x1,y1,z0)],col,(1,0,0),group)
 def slope_plank(self,a,b,top,bottom,half_width,color,group):
  a0,a1=float(top(a)),float(top(b));z0,z1=-half_width,half_width;lo=bottom
  self.quad([(a,a0,z0),(b,a1,z0),(b,a1,z1),(a,a0,z1)],color,(0,1,0),group)
  self.quad([(a,a0-lo,z1),(b,a1-lo,z1),(b,a1-lo,z0),(a,a0-lo,z0)],'plank_edge',(0,-1,0),group)
  self.quad([(a,a0-lo,z0),(b,a1-lo,z0),(b,a1,z0),(a,a0,z0)],'plank_edge',(0,0,-1),group)
  self.quad([(a,a0,z1),(b,a1,z1),(b,a1-lo,z1),(a,a0-lo,z1)],'plank_edge',(0,0,1),group)
  self.quad([(a,a0-lo,z1),(a,a0-lo,z0),(a,a0,z0),(a,a0,z1)],'plank_edge',(-1,0,0),group)
  self.quad([(b,a1-lo,z0),(b,a1-lo,z1),(b,a1,z1),(b,a1,z0)],'plank_edge',(1,0,0),group)
 def curved_beam(self,xx,yfun,zcenter,width,height,color,group):
  z0,z1=zcenter-width*.5,zcenter+width*.5
  for i,(a,b) in enumerate(zip(xx[:-1],xx[1:])):
   ya,yb=yfun(a),yfun(b)
   self.quad([(a,ya-height*.5,z0),(b,yb-height*.5,z0),(b,yb+height*.5,z0),(a,ya+height*.5,z0)],color,(0,0,-1),group)
   self.quad([(a,ya+height*.5,z1),(b,yb+height*.5,z1),(b,yb-height*.5,z1),(a,ya-height*.5,z1)],color,(0,0,1),group)
   self.quad([(a,ya+height*.5,z0),(b,yb+height*.5,z0),(b,yb+height*.5,z1),(a,ya+height*.5,z1)],color,(0,1,0),group)
   self.quad([(a,ya-height*.5,z1),(b,yb-height*.5,z1),(b,yb-height*.5,z0),(a,ya-height*.5,z0)],color,(0,-1,0),group)
  for x,n in [(xx[0],(-1,0,0)),(xx[-1],(1,0,0))]:
   y=yfun(x)
   self.quad([(x,y-height*.5,z0),(x,y-height*.5,z1),(x,y+height*.5,z1),(x,y+height*.5,z0)],color,n,group)
 def cylinder(self,center,radius,height,n,body,cap,group,axis='z'):
  cx,cy,cz=center
  def point(q,ax):
   theta=2*math.pi*q/n
   if axis=='z':return (cx+radius*math.cos(theta),cy+radius*math.sin(theta),cz+ax)
   return (cx+radius*math.cos(theta),cy+ax,cz+radius*math.sin(theta))
  for j in range(n):
   p0,p1=point(j,-height/2),point(j+1,-height/2);p2,p3=point(j+1,height/2),point(j,height/2)
   if axis=='z':normal=(math.cos(2*math.pi*(j+.5)/n),math.sin(2*math.pi*(j+.5)/n),0)
   else:normal=(math.cos(2*math.pi*(j+.5)/n),0,math.sin(2*math.pi*(j+.5)/n))
   self.quad([p0,p1,p2,p3],body if j%3 else cap,normal,group)
  def cap_tri(j,side):
   mid=(cx,cy,cz+(height/2)*side) if axis=='z' else (cx,cy+(height/2)*side,cz)
   return [mid,point(j,side*height/2),point(j+1,side*height/2)]
  for j in range(n):
   self.tri(cap_tri(j,-1),cap,(0,0,-1) if axis=='z' else (0,-1,0),group)
   self.tri(cap_tri(j,1),cap,(0,0,1) if axis=='z' else (0,1,0),group)
 def diagonal(self,p,q,width,color,group):
  p=np.asarray(p,float);q=np.asarray(q,float)
  tangent=(q-p)/np.linalg.norm(q-p);side=np.array([-tangent[1],tangent[0],0]);depth=np.array([0,0,1])
  P=[p-side*width/2-depth*width/2,p+side*width/2-depth*width/2,p+side*width/2+depth*width/2,p-side*width/2+depth*width/2]
  Q=[q-side*width/2-depth*width/2,q+side*width/2-depth*width/2,q+side*width/2+depth*width/2,q-side*width/2+depth*width/2]
  for i in range(4):
   j=(i+1)%4;normal=np.cross(P[j]-P[i],Q[j]-P[i]);self.quad([P[i],P[j],Q[j],Q[i]],color,normal,group)
  self.quad(P,color,-tangent,group);self.quad(Q,color,tangent,group)
 def mesh(self):
  mesh=trimesh.Trimesh(vertices=np.array(self.v,dtype=np.float32),faces=np.array(self.f,dtype=np.int64),process=False)
  mesh.visual.vertex_colors=np.asarray(self.colors,dtype=np.uint8)
  assert (mesh.area_faces>1e-8).all()
  assert np.isfinite(mesh.vertices).all()
  return mesh
def arched_bridge(lod):
 b=Builder();half=2.8;w=1.09
 def deck(x):return .86+.42*max(0,1-(abs(x)/half)**1.85)
 nplank=[11,7,4][lod]
 for k in range(nplank):
  a=-half+(2*half/nplank)*(k+.045);c=-half+(2*half/nplank)*(k+.955)
  b.slope_plank(a,c,deck,.16,w,['plank','plank_light','plank_warm','plank_light'][k%4],'deck')
 nside=[9,6,3][lod];xx=np.linspace(-half,half,nside+1)
 for side in [-1,1]:
  z=side*.95
  b.curved_beam(xx,lambda x:deck(x)-.29,z,.16,.23,'support','under_beam')
  b.curved_beam(xx,lambda x:deck(x)+.73,side*1.13,.14,.18,'rail','curved_rail')
 for side in [-1,1]:
  z=side*1.13
  for x in [-2.54,2.54]:
   y=deck(x)
   b.prism((x-.15,y-.53,z-.15),(x+.15,y+1.03,z+.15),'post','end_post')
   if lod<2:b.prism((x-.20,y+1.03,z-.20),(x+.20,y+1.16,z+.20),'post_top','post_cap')
   if lod==0:
    direction=1 if x<0 else -1
    b.diagonal((x+direction*.73,deck(x+direction*.73)-.26,z),(x,y-.48,z),.16,'support','diagonal')
 for side in [-1,1]:
  z=side*1.13
  for x in ([-.98,.98] if lod==0 else ([0] if lod==1 else [])):
   y=deck(x)
   b.prism((x-.10,y+.02,z-.1),(x+.10,y+.72,z+.1),'rail_light','rail_upright')
 if lod==0:
  for x in [-2.78,2.78]:
   b.prism((x-.11,deck(x)-.15,-1.07),(x+.11,deck(x)-.055,1.07),'plank_edge','edge_lip')
 return b
def log_bridge(lod):
 b=Builder();half=2.15;wide=1.04;count=[8,6,3][lod]
 for k in range(count):
  a=-half+(2*half/count)*(k+.045);c=-half+(2*half/count)*(k+.955)
  b.prism((a,.66,-wide),(c,.82,wide),['plank','plank_light','plank_warm'][k%3],'deck')
 for x in (-1.56,1.56):
  b.cylinder((x,.31,0),.29,2.25,[10,8,6][lod],'log','log_end','support_log','z')
 if lod<2:
  for z in (-.80,.80):b.prism((-2.04,.48,z-.105),(2.04,.64,z+.105),'support','stringer')
 if lod<=1:
  for x in (-1.92,1.92):
   for z in (-.86,.86):b.cylinder((x,.95,z),.115,.27,[6,5][lod],'peg','post_top','corner_peg','y')
 else:
  for x in (-1.92,1.92):
   for z in (-.86,.86):b.prism((x-.10,.82,z-.10),(x+.10,1.04,z+.10),'peg','corner_peg')
 return b
CONF={
 'wooden_arch_bridge':{'id':'structure.bridge.wooden_arch_v1','name':'Pont en bois arqué V1','span_m':5.6,'width_m':2.45,'visual':'arch, two curved rails, four end posts, diagonals, staggered planks','placement':{'axis':'X','leftBank':[-2.8,.86,0],'rightBank':[2.8,.86,0]}},
 'log_bridge':{'id':'structure.bridge.log_v1','name':'Pont rustique en rondins V1','span_m':4.3,'width_m':2.25,'visual':'flat planks, two crosswise logs, four small pegs','placement':{'axis':'X','leftBank':[-2.15,.82,0],'rightBank':[2.15,.82,0]}}
}
manifest={'schemaVersion':1,'status':'ART_APPROVED_RUNTIME_NOT_QUALIFIED','license':'project-original','units':'m','up':'Y','forward':'-Z','textures':0,'models':[]}
for typ,fn in [('wooden_arch_bridge',arched_bridge),('log_bridge',log_bridge)]:
 desc=CONF[typ].copy();desc['lods']=[]
 dst=MODELS/typ;dst.mkdir(exist_ok=True,parents=True)
 for lod in range(3):
  b=fn(lod);mesh=b.mesh();path=dst/f'lod{lod}.glb'
  path.write_bytes(trimesh.exchange.gltf.export_glb(mesh,include_normals=True))
  imp=trimesh.load(path,force='scene').to_geometry()
  assert len(imp.faces)==len(mesh.faces) and imp.visual.kind=='vertex'
  assert np.allclose(imp.bounds,mesh.bounds,atol=1e-5)
  assert (imp.area_faces>1e-8).all() and np.isfinite(imp.face_normals).all()
  desc['lods'].append({'file':f'models/structures/bridges/{typ}/lod{lod}.glb','triangles':len(mesh.faces),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'boundsMeters':np.round(mesh.bounds,3).tolist(),'componentTriangles':b.groups})
 manifest['models'].append(desc)
MANIFEST_FILE.parent.mkdir(parents=True,exist_ok=True)
MANIFEST_FILE.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'models':[{'id':m['id'],'lods':[(x['triangles'],x['bytes']) for x in m['lods']]} for m in manifest['models']]},ensure_ascii=False,indent=2))
