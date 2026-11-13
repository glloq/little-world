import os, json, math, zipfile, hashlib
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix

OUT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.makedirs(OUT+'/public/models/buildings/windmill_stone', exist_ok=True)
os.makedirs(OUT+'/public/models/buildings/windmill_stone', exist_ok=True)

def color(c): return np.array(c,dtype=np.uint8)
STONE=color([221,206,181,255]); STONE_DARK=color([190,176,155,255]); WOOD=color([157,103,56,255]); WOOD_DARK=color([120,78,44,255]); ROOF=color([90,110,130,255]); SAIL=color([244,232,206,255]); TRIM=color([235,226,206,255]); WINDOW=color([154,110,64,255])

def set_color(m,rgba): m.visual.vertex_colors=np.tile(np.array(rgba,dtype=np.uint8),(len(m.vertices),1)); return m

def box(ext, center=(0,0,0), rgba=None):
    m=trimesh.creation.box(extents=ext); m.apply_translation(center)
    return set_color(m,rgba) if rgba is not None else m

def cylinder(radius,height,sections=12,axis='y',center=(0,0,0),rgba=None):
    m=trimesh.creation.cylinder(radius=radius,height=height,sections=sections)
    if axis=='y': m.apply_transform(rotation_matrix(np.pi/2,[1,0,0]))
    elif axis=='x': m.apply_transform(rotation_matrix(np.pi/2,[0,1,0]))
    m.apply_translation(center)
    return set_color(m,rgba) if rgba is not None else m

def conical_frustum(r0,r1,h,sections=8,center=(0,0,0),rgba=None):
    verts=[]; faces=[]
    for i in range(sections):
        a=2*math.pi*i/sections
        x0,z0=math.cos(a)*r0,math.sin(a)*r0
        x1,z1=math.cos(a)*r1,math.sin(a)*r1
        verts += [[x0,0,z0],[x1,h,z1]]
    bi=len(verts); verts.append([0,0,0]); ti=len(verts); verts.append([0,h,0])
    for i in range(sections):
        i0=2*i; i1=2*((i+1)%sections)
        faces += [[i0,i0+1,i1],[i1,i0+1,i1+1],[bi,i0,i1],[ti,i1+1,i0+1]]
    m=trimesh.Trimesh(vertices=np.array(verts),faces=np.array(faces),process=False)
    m.apply_translation(center)
    return set_color(m,rgba) if rgba is not None else m

def prism_quad(corners,thickness,rgba):
    profile=np.asarray(corners,float); half=thickness/2
    vertices=np.vstack([np.column_stack([profile,np.full(4,half)]), np.column_stack([profile,np.full(4,-half)])])
    faces=[[0,1,2],[0,2,3],[4,6,5],[4,7,6]]
    for i in range(4):
        j=(i+1)%4; faces += [[i,4+j,j],[i,4+i,4+j]]
    return set_color(trimesh.Trimesh(vertices=vertices,faces=np.array(faces),process=False),rgba)

def oriented_boxes(width,height,depth,center,angle_deg,colors):
    frame=[]
    # angle around y axis, front normal pointed outward in xz plane
    ang=math.radians(angle_deg)
    rot=rotation_matrix(ang,[0,1,0])
    def ob(ext,c,rgba):
        m=box(ext,c,rgba); m.apply_transform(rot); return m
    def world(dx,dy,dz): return (center[0]+dx,center[1]+dy,center[2]+dz)
    return ob

def make_door_window(face_angle_deg, base_r, lod):
    parts=[]
    # unit outward normal/tangent for chosen flat face center angle
    a=math.radians(face_angle_deg)
    n=np.array([math.cos(a),0,math.sin(a)])
    t=np.array([-math.sin(a),0,math.cos(a)])
    # place on face plane slightly outside tower side
    # Door: wood color on side face
    door_center = n*(base_r-0.04) + np.array([0,1.10,0])
    frame_center = n*(base_r-0.08) + np.array([0,1.10,0])
    step_center = n*(base_r+0.18) + np.array([0,0.18,0])
    # create oriented box helper: local x along tangent, y vertical, z along normal
    def ob(extents,center,rgba):
        m=box(extents,(0,0,0),rgba)
        # local depth along z must face outward normal n; tangent along x
        R=np.eye(4)
        R[:3,0]=t; R[:3,1]=np.array([0,1,0]); R[:3,2]=n
        m.apply_transform(R); m.apply_translation(center)
        return m
    # stone doorstep base block
    parts.append(ob((1.20,0.36,0.85), step_center, STONE_DARK))
    parts.append(ob((0.92,0.10,0.42), n*(base_r+0.42)+np.array([0,0.40,0]), STONE_DARK))
    # trim and wood door
    parts.append(ob((1.04,1.70,0.10), frame_center, STONE_DARK))
    parts.append(ob((0.84,1.46,0.13), door_center, WOOD))
    parts.append(ob((0.84,0.08,0.04), n*(base_r+0.03)+np.array([0,0.38,0]), WOOD_DARK))
    parts.append(ob((0.14,1.44,0.03), door_center + t*(-0.20) + n*0.055, WOOD_DARK))
    parts.append(ob((0.14,1.44,0.03), door_center + t*( 0.20) + n*0.055, WOOD_DARK))
    parts.append(ob((0.50,0.08,0.03), door_center + np.array([0,0.56,0]) + n*0.055, WOOD_DARK))
    # window above on same flat face, wood color frame and shutters
    if lod<2:
        wc = n*(base_r-0.03) + np.array([0,3.30,0])
        parts.append(ob((0.92,1.00,0.08), n*(base_r-0.08)+np.array([0,3.30,0]), STONE_DARK))
        parts.append(ob((0.64,0.74,0.06), wc, WINDOW))
        parts.append(ob((0.08,0.74,0.08), wc+n*0.04, WOOD_DARK))
        parts.append(ob((0.64,0.08,0.08), wc+n*0.04, WOOD_DARK))
        # shutters/panels wood tone
        parts.append(ob((0.14,0.70,0.05), wc+t*(-0.39)+n*0.03, WOOD))
        parts.append(ob((0.14,0.70,0.05), wc+t*( 0.39)+n*0.03, WOOD))
    return parts

def tapered_blade(length=5.55,tip_width=2.08,root_width=0.68,lod=0,pitch_root=-13,pitch_tip=-19):
    y0=0.55; rail_w=.09 if lod<2 else .10
    widths=([root_width,1.24,1.74,tip_width] if lod==0 else [root_width,1.38,tip_width] if lod==1 else [root_width,tip_width])
    heights=([0.,.33,.69,1.] if lod==0 else [0.,.55,1.] if lod==1 else [0.,1.])
    stations=[(y0+length*f,w) for f,w in zip(heights,widths)]
    parts=[]
    for (a,wa),(b,wb) in zip(stations,stations[1:]):
        for side in [-1,1]:
            edge_a=side*wa*.5; edge_b=side*wb*.5; inner_a=edge_a-side*rail_w; inner_b=edge_b-side*rail_w
            quad=[(edge_a,a),(inner_a,a),(inner_b,b),(edge_b,b)] if side<0 else [(inner_a,a),(edge_a,a),(edge_b,b),(inner_b,b)]
            parts.append(prism_quad(quad,.11,WOOD))
        ia=wa/2-rail_w-.025; ib=wb/2-rail_w-.025
        parts.append(prism_quad([(-ia,a),(ia,a),(ib,b),(-ib,b)], .045, SAIL))
    ribs=5 if lod==0 else 3 if lod==1 else 1
    for frac in [0.03,*[i/(ribs+1) for i in range(1,ribs+1)],0.98]:
        yy=y0+length*frac; k=next((i for i in range(len(stations)-1) if yy<=stations[i+1][0]),len(stations)-2)
        ya,wa=stations[k]; yb,wb=stations[k+1]; width=wa+(wb-wa)*(yy-ya)/(yb-ya)
        parts.append(box((width,.075,.11),center=(0,yy,0),rgba=WOOD))
    if lod==0: parts.append(box((.11,length,.11),center=(0,y0+length/2,0),rgba=WOOD_DARK))
    mesh=trimesh.util.concatenate(parts)
    verts=mesh.vertices.copy(); frac=np.clip((verts[:,1]-y0)/length,0,1); theta=np.deg2rad(pitch_root+(pitch_tip-pitch_root)*frac)
    x=verts[:,0].copy(); z=verts[:,2].copy()
    verts[:,0]=x*np.cos(theta)+z*np.sin(theta); verts[:,2]=-x*np.sin(theta)+z*np.cos(theta)
    mesh.vertices=verts
    return mesh

AXLE_Y=7.48; AXLE_Z=-1.58; BASE_R=2.12; TOP_R=1.48; HEIGHT=7.95; ROOF_BASE_R=2.02; FACE_ANGLE=157.5 # left side flat face relative to front rotor
PIVOTS={0:[0,AXLE_Y,-3.45],1:[0,AXLE_Y,-3.28],2:[0,AXLE_Y,-3.28]}

def make_windmill(lod=0):
    sec=8 if lod==0 else 6 if lod==1 else 5; parts=[]
    # stronger stone base + tower + roof
    parts.append(conical_frustum(BASE_R+0.34, BASE_R+0.24, 0.48, sections=sec, center=(0,0,0), rgba=STONE_DARK))
    parts.append(conical_frustum(BASE_R+0.22, BASE_R+0.08, 0.30, sections=sec, center=(0,0.46,0), rgba=TRIM))
    parts.append(conical_frustum(BASE_R, TOP_R, HEIGHT, sections=sec, center=(0,0.76,0), rgba=STONE))
    parts.append(conical_frustum(TOP_R+0.18, TOP_R+0.12, 0.22, sections=sec, center=(0,HEIGHT+0.74,0), rgba=WOOD_DARK))
    parts.append(conical_frustum(ROOF_BASE_R,0.22,1.52,sections=sec,center=(0,HEIGHT+0.92,0),rgba=ROOF))
    parts.append(box((0.22,0.18,0.22),center=(0,HEIGHT+2.34,0),rgba=WOOD_DARK))
    parts.extend(make_door_window(FACE_ANGLE, BASE_R+0.03, lod))
    # axle trim and support under roof front
    parts.append(box((1.30,0.22,0.18),center=(0,AXLE_Y+0.57,AXLE_Z-0.02),rgba=TRIM))
    parts.append(box((0.22,1.10,0.18),center=(-0.54,AXLE_Y+0.01,AXLE_Z-0.02),rgba=TRIM))
    parts.append(box((0.22,1.10,0.18),center=(0.54,AXLE_Y+0.01,AXLE_Z-0.02),rgba=TRIM))
    parts.append(box((0.76,0.16,0.08),center=(0,AXLE_Y-0.55,AXLE_Z+0.09),rgba=WOOD_DARK))
    axle_len=2.28 if lod<2 else 2.10; hub_center_z=-3.27 if lod==0 else -3.14
    pivot=np.array(PIVOTS[lod],float)
    parts.append(cylinder(.25,axle_len,sections=10 if lod<2 else 8,axis='z',center=(0,AXLE_Y,hub_center_z+0.80),rgba=WOOD))
    parts.append(cylinder(.58 if lod<2 else .50, .42, sections=12 if lod==0 else 10 if lod==1 else 8, axis='z', center=(0,AXLE_Y,hub_center_z+0.17), rgba=WOOD))
    parts.append(cylinder(.30 if lod<2 else .26,.12,sections=10 if lod<2 else 8,axis='z',center=(0,AXLE_Y,hub_center_z-0.06),rgba=WOOD_DARK))
    if lod<2:
        count=8 if lod==0 else 6
        for k in range(count):
            ang=2*math.pi*k/count
            parts.append(cylinder(.05,.06,sections=6,axis='z',center=(math.cos(ang)*0.40,AXLE_Y+math.sin(ang)*0.40,hub_center_z),rgba=WOOD_DARK))
    static=trimesh.util.concatenate(parts)
    blade_len=5.55 if lod==0 else 5.35 if lod==1 else 5.10
    blade=tapered_blade(length=blade_len,tip_width=2.08 if lod==0 else 1.97 if lod==1 else 1.77,root_width=0.68 if lod<2 else 0.62,lod=lod,pitch_root=-13,pitch_tip=-19)
    bl=[]
    for ang in [0,np.pi/2,np.pi,3*np.pi/2]:
        m=blade.copy(); m.apply_transform(rotation_matrix(ang,[0,0,1])); m.apply_translation(pivot); bl.append(m)
    rotor=trimesh.util.concatenate(bl)
    return static, rotor, pivot

def write_glb(lod):
    static, rotor, pivot = make_windmill(lod)
    scene=trimesh.Scene(); scene.add_geometry(static,node_name='Body',geom_name='Body')
    rotor.apply_translation(-pivot); scene.add_geometry(rotor,node_name='RotorPivot',geom_name='Rotor',transform=translation_matrix(pivot))
    path=f'{OUT}/public/models/buildings/windmill_stone/lod{lod}.glb'
    open(path,'wb').write(scene.export(file_type='glb')); return path

if __name__ == '__main__':
    paths = [write_glb(i) for i in range(3)]
    print('Generated:', *paths, sep='\n')

