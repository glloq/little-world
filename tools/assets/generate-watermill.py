#!/usr/bin/env python3
from __future__ import annotations
import os, math, json, base64, zipfile
from pathlib import Path
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT=Path(__file__).resolve().parents[1]
MODELS=OUT/'models'/'watermill_log_stone'
PREVIEW=OUT/'preview'
MODELS.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)

def C(rgb): return np.array([*rgb,255],dtype=np.uint8)
COL={
 'log':C((170,110,58)), 'log_light':C((193,131,75)), 'log_dark':C((120,77,42)),
 'plank':C((181,120,70)), 'stone':C((184,171,160)), 'stone_light':C((205,192,181)),
 'stone_dark':C((150,138,129)), 'roof':C((90,102,128)), 'roof_b':C((101,112,140)),
 'glass':C((103,149,184)), 'door':C((144,92,52)), 'cream':C((214,191,153)), 'shadow':C((78,65,55))
}

def paint(mesh,key):
    co=COL.get(key,key)
    mesh.visual.vertex_colors=np.tile(np.array(co,dtype=np.uint8),(len(mesh.vertices),1))
    return mesh

def cube(extents,center,color='log',rotation=None):
    m=trimesh.creation.box(extents=extents)
    if rotation is not None:m.apply_transform(rotation)
    m.apply_translation(center)
    return paint(m,color)

def cyl(radius,height,sections,axis='x',center=(0,0,0),color='log'):
    m=trimesh.creation.cylinder(radius=radius,height=height,sections=sections)
    if axis=='x': m.apply_transform(rotation_matrix(math.pi/2,[0,1,0]))
    elif axis=='y': m.apply_transform(rotation_matrix(math.pi/2,[1,0,0]))
    m.apply_translation(center)
    return paint(m,color)

def tri_mesh(verts,faces,color):
    m=trimesh.Trimesh(vertices=np.array(verts,float),faces=np.array(faces,int),process=False)
    return paint(m,color)

def arch_front(z, lod=0):
    parts=[]
    L=3.15; R=.78; ymax=1.52; rise=.42; thickness=.24; dz=thickness/2
    parts.append(cube((L-R,ymax,thickness),(-(L+R)/2,ymax/2,z),'stone'))
    parts.append(cube((L-R,ymax,thickness),((L+R)/2,ymax/2,z),'stone'))
    steps=(5,3,2)[lod]
    for i in range(steps):
        x0=-R+2*R*i/steps; x1=-R+2*R*(i+1)/steps
        y0=rise+math.sqrt(max(0,R*R-x0*x0)); y1=rise+math.sqrt(max(0,R*R-x1*x1))
        verts=[(x0,y0,z-dz),(x1,y1,z-dz),(x1,ymax,z-dz),(x0,ymax,z-dz),(x0,y0,z+dz),(x1,y1,z+dz),(x1,ymax,z+dz),(x0,ymax,z+dz)]
        faces=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[0,3,7],[0,7,4],[1,5,6],[1,6,2]]
        parts.append(tri_mesh(verts,faces,'stone_light' if i%2 else 'stone'))
    return parts

def gable(x,half_depth,wall_top,ridge,color='log'):
    z=half_depth
    verts=[(x-.045,wall_top,-z),(x-.045,wall_top,z),(x-.045,ridge,0),(x+.045,wall_top,-z),(x+.045,wall_top,z),(x+.045,ridge,0)]
    faces=[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]]
    return tri_mesh(verts,faces,color)

def wheel_ring(radius_outer=1.74,radius_inner=1.50,thickness=.14,sections=8,x=0,color='log'):
    V=[]; F=[]; h=thickness/2
    for i in range(sections):
        a=2*math.pi*i/sections; ca,sa=math.cos(a),math.sin(a)
        V.extend([[x-h,radius_outer*ca,radius_outer*sa],[x-h,radius_inner*ca,radius_inner*sa],[x+h,radius_outer*ca,radius_outer*sa],[x+h,radius_inner*ca,radius_inner*sa]])
    for i in range(sections):
        j=(i+1)%sections; a=i*4; b=j*4
        F.extend([[a,a+1,b],[b,a+1,b+1],[a+2,b+2,a+3],[b+2,b+3,a+3],[a,b,a+2],[b,b+2,a+2],[a+1,a+3,b+1],[b+1,a+3,b+3]])
    return tri_mesh(V,F,color)

def waterwheel(lod=0):
    # Wider wheel: deeper rings and slightly broader paddles for a chunkier silhouette.
    parts=[wheel_ring(radius_outer=1.78,radius_inner=1.50,thickness=.18,sections=(8,6,5)[lod],x=-.34,color='log'),
           wheel_ring(radius_outer=1.78,radius_inner=1.50,thickness=.18,sections=(8,6,5)[lod],x=.34,color='log_dark')]
    n_spokes=(6,4,3)[lod]
    for i in range(n_spokes):
        a=i*2*math.pi/n_spokes
        spoke=cube((.16,1.40,.18),(0,.72,0),'log_light' if i%2 else 'log_dark')
        spoke.apply_transform(rotation_matrix(a,[1,0,0]))
        parts.append(spoke)
    n_paddles=(8,6,5)[lod]
    for i in range(n_paddles):
        a=i*2*math.pi/n_paddles
        paddle=cube((.84,.10,.38),(0,1.84,0),'log')
        paddle.apply_transform(rotation_matrix(a,[1,0,0]))
        parts.append(paddle)
    parts.append(cyl(.24,.94,sections=6,axis='x',color='log_dark'))
    parts.append(cyl(.30,.12,sections=6,axis='x',center=(-.41,0,0),color='cream'))
    return trimesh.util.concatenate(parts)

WHEEL_PIVOT=(3.98,2.02,0.08)

def make_model(lod=0):
    parts=[]
    parts += arch_front(-1.92,lod)
    # Back foundation is a solid stone wall; no second arch.
    parts.append(cube((6.30,1.52,.24),(0,.76,+1.92),'stone'))
    parts.append(cube((.22,1.52,3.92),(-3.16,.76,0),'stone'))
    parts.append(cube((.22,1.52,3.92),(+3.16,.76,0),'stone'))
    parts.append(cube((6.30,.12,3.95),(0,1.55,0),'stone_dark'))
    parts.append(cube((6.18,.24,3.64),(0,1.68,0),'log_dark'))
    parts.append(cube((6.22,2.10,3.72),(0,2.88,0),'log_dark'))
    rows=([1.90,2.30,2.70,3.10,3.50,3.90],[1.90,2.55,3.22,3.90],[1.93,3.35])[lod]
    for i,y in enumerate(rows):
        for sign in (-1,1):
            parts.append(cyl(.16,6.36,4,'x',(0,y,sign*1.84),'log_light' if (i+int(sign>0))%3==0 else 'log'))
            parts.append(cyl(.16,3.88,4,'z',(sign*3.10,y,0),'log_dark' if i%2 else 'log'))
    parts.append(gable(-3.12,1.88,3.95,5.55,'log'))
    parts.append(gable(+3.12,1.88,3.95,5.55,'log'))
    slope_len=math.hypot(2.12,1.95); roof_x=6.85
    for side in (-1,1):
        ang=math.atan2(1.95,side*2.12)
        parts.append(cube((roof_x,.12,slope_len+.10),(0,4.63,side*1.02),'roof',rotation=rotation_matrix(ang,[1,0,0])))
        parts.append(cube((roof_x,.08,.14),(0,3.72,side*2.06),'roof_b'))
        if lod<2: parts.append(cube((roof_x,.08,.12),(0,4.96,side*.92),'roof_b',rotation=rotation_matrix(ang,[1,0,0])))
    parts.append(cube((.62,.72,.52),(1.20,5.74,.18),'stone'))
    if lod<2: parts.append(cube((.76,.14,.64),(1.20,6.10,.18),'stone_light'))
    for wx in (-1.02,.78):
        wz=-2.01
        parts.append(cube((.86,1.00,.16),(wx,2.92,wz),'cream'))
        parts.append(cube((.62,.76,.07),(wx,2.92,wz-.12),'glass'))
        if lod<1:
            parts.append(cube((.08,.76,.09),(wx,2.92,wz-.16),'log_dark'))
            parts.append(cube((.62,.08,.09),(wx,2.92,wz-.16),'log_dark'))
            parts.append(cube((.98,.10,.20),(wx,3.45,wz-.05),'cream'))
        elif lod==1:
            parts.append(cube((.08,.76,.09),(wx,2.92,wz-.16),'log_dark'))
    # Door mounted in the upper log wall on the GABLE END OPPOSITE the wheel.
    # In source coordinates, door is at +X; mirroring X places it at world -X,
    # opposite the wheel at world +X. The wooden entry starts above the stone plinth.
    door_x=3.31
    door_y=2.74
    door_z=-0.12
    # Dark wood door-frame and plank door. The front surface projects beyond
    # the 4-sided log ends (x=3.10 +/- 0.16), so it cannot be hidden behind logs.
    parts.append(cube((.13,1.78,1.15),(door_x,door_y,door_z),'log_dark'))
    parts.append(cube((.10,1.57,.90),(door_x+.12,door_y,door_z),'door'))
    # Three longitudinal plank joints in the visible door face (Y-oriented).
    if lod==0:
        for zoff in (-.25,0.0,.25):
            parts.append(cube((.035,1.43,.025),(door_x+.19,door_y,door_z+zoff),'log_dark'))
    # Door crosspieces and sloping brace in its own YZ plane.
    if lod<2:
        for yoff in (-.54,.54):
            parts.append(cube((.04,.10,.81),(door_x+.19,door_y+yoff,door_z),'log_light'))
    if lod==0:
        diag=cube((.05,.10,1.02),(0,0,0),'log_dark')
        diag.apply_transform(rotation_matrix(.78,[1,0,0]))
        diag.apply_translation((door_x+.22,door_y,door_z))
        parts.append(diag)
    if lod==0: parts.append(cyl(.055,.09,6,'x',(door_x+.21,door_y-.04,door_z+.33),'cream'))
    # Flush wooden threshold built into the upper timber wall. No platform/stairs.
    parts.append(cube((.16,.09,1.04),(door_x+.18,1.94,door_z),'log_light'))
    # Preserve the small storage annex but position it on the back wall, clear
    # of the side entrance and the stair landing.
    parts.append(cube((1.25,1.12,.92),(-1.35,1.00,+2.18),'plank'))
    if lod<2: parts.append(cube((1.33,.11,1.05),(-1.35,1.59,+2.18),'log_dark'))
    parts.append(cube((1.05,.92,.09),(-1.35,.98,+2.68),'door'))
    if lod<1: parts.append(cyl(.22,.10,6,'x',(-3.22,2.05,.08),'log_dark'))
    static=trimesh.util.concatenate(parts); wheel=waterwheel(lod);
    M=np.diag([-1.,1.,1.,1.]); static.apply_transform(M); wheel.apply_transform(M)
    return static,wheel



def export(lod=0):
    static,wheel=make_model(lod)
    scene=trimesh.Scene()
    scene.add_geometry(static,node_name='Body',geom_name='Body')
    scene.add_geometry(wheel,node_name='WheelPivot',geom_name='Wheel',transform=translation_matrix(WHEEL_PIVOT))
    target=MODELS/f'lod{lod}.glb'
    target.write_bytes(scene.export(file_type='glb'))
    reload=trimesh.load(target,force='scene')
    return target,sum(len(m.faces) for m in reload.geometry.values())

if __name__=='__main__':
    for lod in (0,1,2):
        target,triangles=export(lod)
        print(target,triangles,target.stat().st_size)
