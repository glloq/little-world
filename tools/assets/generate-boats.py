#!/usr/bin/env python3
"""Little World boats V1 — low-poly assets, no external textures; Y-up, bow +Z.
One common static hull mesh plus independently movable oars, rudder, boom and sail.
"""
from pathlib import Path
import math, json, struct, hashlib
import numpy as np
import trimesh
from trimesh.transformations import translation_matrix, rotation_matrix

ROOT=Path(__file__).resolve().parents[2]
COLORS={
 'hull': (149,95,51,255), 'hull_light':(184,123,67,255), 'hull_mid':(168,108,57,255),
 'hull_dark':(103,66,38,255), 'rim':(207,147,83,255), 'seat':(196,142,83,255),
 'floor':(123,84,52,255), 'iron':(96,110,110,255), 'rope':(185,168,119,255),
 'sail':(246,233,194,255), 'sail_mid':(237,222,183,255), 'sail_dark':(218,204,170,255),
 'paddle':(174,111,61,255), 'stripe':(218,164,87,255), 'trim':(91,64,44,255),
}

def col(m,c):
    c = COLORS.get(c,c)
    m.visual.vertex_colors=np.tile(np.array(c,dtype=np.uint8),(len(m.vertices),1))
    return m

def box(ext,center,c):
    m=trimesh.creation.box(extents=np.array(ext,float));m.apply_translation(center)
    return col(m,c)

def quad(points,orientation,c):
    points=np.array(points,dtype=float)
    faces=np.array([[0,1,2],[0,2,3]],dtype=np.int64)
    n=np.cross(points[1]-points[0],points[2]-points[0])
    if np.dot(n,np.asarray(orientation,dtype=float))<0: faces=faces[:,::-1]
    return col(trimesh.Trimesh(vertices=points,faces=faces,process=False),c)

def cyl(radius, length, section, axis, center, c):
    m=trimesh.creation.cylinder(radius=radius,height=length,sections=section)
    if axis=='y': m.apply_transform(rotation_matrix(-math.pi/2,[1,0,0]))
    elif axis=='x': m.apply_transform(rotation_matrix(math.pi/2,[0,1,0]))
    m.apply_translation(center)
    return col(m,c)

def beam_between(a,b,width,depth,c):
    a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float);v=b-a
    center=(a+b)/2
    m=trimesh.creation.box(extents=[width,float(np.linalg.norm(v)),depth])
    direction=v/np.linalg.norm(v)
    rot=trimesh.geometry.align_vectors([0,1,0],direction)
    m.apply_transform(rot)
    m.apply_translation(center)
    return col(m,c)

def hull(sail=False, lod=0):
    # longitudinal widths explicitly controlled; rather than one scaled sphere.
    if sail:
        zs=[-2.55,-2.20,-1.55,-.80,0,.90,1.65,2.18,2.62] if lod==0 else [-2.55,-1.90,-.80,.45,1.55,2.62]
        ws=[.32,.76,1.02,1.10,1.12,1.03,.82,.52,.08] if lod==0 else [.32,.91,1.10,1.09,.85,.08]
    else:
        zs=[-1.82,-1.55,-1.06,-.42,.38,1.02,1.53,1.87] if lod==0 else [-1.82,-1.27,-.25,.78,1.45,1.87]
        ws=[.24,.61,.76,.78,.77,.67,.44,.10] if lod==0 else [.24,.70,.78,.72,.49,.10]
    L=len(zs)
    upperY=[.89 + (0.10 if abs(z)>max(abs(a) for a in zs)*.81 else 0) for z in zs]
    chineY=[.22 + (.08 if abs(z)>max(abs(a) for a in zs)*.81 else 0) for z in zs]
    keelY=[-.28 + (.16 if abs(z)>max(abs(a) for a in zs)*.81 else 0) for z in zs]
    pieces=[]
    for i in range(L-1):
        a,b=zs[i],zs[i+1];wa,wb=ws[i],ws[i+1]
        for sign in [-1,1]:
            # two side planking bands, shaded to avoid costly textures
            ya,yb=upperY[i],upperY[i+1]
            ma,mb=chineY[i],chineY[i+1]
            ka,kb=keelY[i],keelY[i+1]
            pa=lambda x,y,z:[sign*x,y,z]
            mid_a=(ya+ma)*.5;mid_b=(yb+mb)*.5
            bands=[
                ([pa(wa,ya,a),pa(wb,yb,b),pa(wb*.87,mid_b,b),pa(wa*.87,mid_a,a)],'hull_light'),
                ([pa(wa*.87,mid_a,a),pa(wb*.87,mid_b,b),pa(wb*.66,mb,b),pa(wa*.66,ma,a)],'hull_mid'),
                ([pa(wa*.66,ma,a),pa(wb*.66,mb,b),pa(wb*.39,kb,b),pa(wa*.39,ka,a)],'hull'),
            ]
            if lod:
                bands=[([pa(wa,ya,a),pa(wb,yb,b),pa(wb*.66,mb,b),pa(wa*.66,ma,a)],'hull_mid'),bands[-1]]
            for pts,c in bands:pieces.append(quad(pts,[sign,.25,0],c))
            # gunwale top ring and inset wall, no invisible duplicate backside faces
            pieces.append(quad([
                pa(wa,ya,a),pa(wb,yb,b),pa(wb*.86,yb,b),pa(wa*.86,ya,a)
            ],[0,1,0],'rim'))
            pieces.append(quad([
                pa(wa*.86,ya,a),pa(wb*.86,yb,b),pa(wb*.60,.24,b),pa(wa*.60,.24,a)
            ],[-sign,0,0],'floor'))
            # lower flat keel surface (two halves)
            pieces.append(quad([
                pa(wa*.39,ka,a),pa(wb*.39,kb,b),[0,kb,b],[0,ka,a]
            ],[0,-1,0],'hull_dark'))
            # floor surface in the well
            pieces.append(quad([
                [0,.24,a], [0,.24,b],pa(wb*.60,.24,b),pa(wa*.60,.24,a)
            ],[0,1,0],'floor'))
    # End transoms: capped hull endpoints where width is narrow
    for at in (0,L-1):
        z=zs[at]; w=ws[at];sign=-1 if at==0 else 1
        pieces.append(quad([[-w,upperY[at],z],[w,upperY[at],z],[w*.39,keelY[at],z],[-w*.39,keelY[at],z]], [0,0,sign],'hull_dark'))
    # benches and floorboard strips; remain walkable visually, no heavy interior details
    if sail:
        benches=[-1.72,1.62]
        floor_z=(-1.45,1.5)
        floor_width=1.12
    else:
        benches=[-.78,.70]
        floor_z=(-1.25,1.25)
        floor_width=.87
    for z in benches:
        width=np.interp(z,zs,ws)*1.45
        pieces.append(box([width,.105,.34],[0,.59,z],'seat'))
        # supports under seat
        if lod==0:
            for x in (-width*.33,width*.33):
                pieces.append(box([.09,.30,.12],[x,.39,z],'hull_dark'))
    for x in ((0,) if lod else (-.25,0,.25)):
        pieces.append(box([.19,.05,floor_z[1]-floor_z[0]],[x,.265,sum(floor_z)/2],'hull_mid'))
    if sail:
        pieces.append(box([1.40,.08,.10],[0,.76,-2.00],'stripe'))
    return trimesh.util.concatenate(pieces)

def oar(side,lod=0):
    # each oar's mesh is local to its rowlock pivot
    d=float(side)
    parts=[
       box([2.12,.07,.075],[d*.82,.04,0],'hull_light'),
       box([.53,.060,.28],[d*1.95,-.005,0],'paddle'),
       *([] if lod else [box([.16,.10,.10],[d*(-.16),.04,0],'trim')]),
    ]
    return trimesh.util.concatenate(parts)

def sailcloth(lod=0):
    # local to the boom pivot, +Y upwards and -Z towards stern
    # sail with progressively increasing camber, double-sided geometry, no alpha plane
    section=4
    bottom=[.10, -.03, -1.80,-2.23]  # z at bottom? these become linearly interpolated surface
    parts=[]
    def interp_points(t):
        # foot from mast to boom tip, head from mast to aft gaff peak
        top_z=.04+( -1.48-.04)*t
        bot_z=.08+(-2.20-.08)*t
        ytop=3.20-0.26*t
        return top_z,bot_z,ytop
    # split into horizontal stripes using station (t from mast to stern)
    steps=4 if lod==0 else 2
    for i in range(steps):
        t0=i/steps;t1=(i+1)/steps
        z0b=.06-2.25*t0;z1b=.06-2.25*t1
        z0t=.04-1.49*t0;z1t=.04-1.49*t1
        h0=3.17-.22*t0;h1=3.17-.22*t1
        # 3 vertical stripes, varying curvature x makes low-poly billow.
        for k in range(3 if lod==0 else 2):
            q0=k/(3 if lod==0 else 2);q1=(k+1)/(3 if lod==0 else 2)
            def v(t,zbottom,ztop,h,q):
                # Bow is +Z. We keep the sail readable in profile, but its belly must now
                # inflate toward the bow (forward) instead of sideways.
                base_z=zbottom*(1-q)+ztop*q
                camber=.16*math.sin(math.pi*q)*(0.45+0.55*math.sin(math.pi*t))
                x=.0
                z=base_z+camber
                return [x,q*h,z]
            corners=[v(t0,z0b,z0t,h0,q0),v(t1,z1b,z1t,h1,q0),v(t1,z1b,z1t,h1,q1),v(t0,z0b,z0t,h0,q1)]
            color='sail' if (i+k)%3 else 'sail_mid'
            # back and front faces; double-sided without relying on material flag
            parts.append(quad(corners,[1,0,0],color))
            parts.append(quad(corners,[-1,0,0],color))
    return trimesh.util.concatenate(parts)

def rolled_sail(lod=0):
    # roll at the boom: cloth gathered along the lowered spar
    parts=[]
    for k in range(5 if lod==0 else 2):
        z=-2.08 + k*(.43 if lod==0 else 1.50)
        parts.append(cyl(.095+(k%2)*.014,.39,section=(5 if lod==0 else 4),axis='z',center=(.035,.07,z),c='sail_mid' if k%2 else 'sail'))
    return trimesh.util.concatenate(parts)

def make_sailboat(lod=0):
    sc=trimesh.Scene()
    static=[hull(True,lod)]
    # mast stops at hull, beam and rig attach just above the deck
    static.append(cyl(.105,4.35,section=(6 if lod==0 else 4),axis='y',center=[0,2.20,.24],c='hull_dark'))
    static.append(cyl(.22,.20,section=(6 if lod==0 else 4),axis='y',center=[0,.69,.24],c='trim'))
    # bowsprit
    static.append(beam_between([0,.84,2.1],[0,1.12,3.02],.105,.105,'rim'))
    # rudder hinge support
    static.append(box([.19,.56,.20],[0,.18,-2.53],'hull_dark'))
    sc.add_geometry(trimesh.util.concatenate(static),node_name='Body',geom_name='Body')
    # rig pivot around mast at y=1.12, z=.24; boom forward and aft
    pivot=[0,1.12,.24]
    sc.graph.update(frame_from='world',frame_to='SailRigPivot',matrix=translation_matrix(pivot))
    boom=beam_between([0,0,-2.42],[0,0,0.0],.12,.12,'hull_dark')
    gaff=beam_between([0,2.90,-1.64],[0,3.22,-.02],.085,.085,'rim')
    sc.add_geometry(trimesh.util.concatenate([boom,gaff]),node_name='Boom',geom_name='Boom',parent_node_name='SailRigPivot')
    sc.add_geometry(sailcloth(lod),node_name='SailCloth',geom_name='SailCloth',parent_node_name='SailRigPivot')
    sc.add_geometry(rolled_sail(lod),node_name='SailRolled',geom_name='SailRolled',parent_node_name='SailRigPivot',transform=np.diag([.002,.002,.002,1.]))
    sc.add_geometry(box([.07,.70,.43],[0,0,-.17],'hull_dark'),node_name='RudderPivot',geom_name='Rudder',transform=translation_matrix([0,.25,-2.55]))
    return sc

def make_rowboat(lod=0):
    sc=trimesh.Scene()
    static=[hull(False,lod)]
    # rowlock socket points, simple wooden supports
    for d in (-1,1):
        static.append(box([.20,.20,.16],[d*.77,.91,-.02],'hull_dark'))
    sc.add_geometry(trimesh.util.concatenate(static),node_name='Body',geom_name='Body')
    for side,name in [(-1,'OarPort'),(1,'OarStarboard')]:
        sc.add_geometry(oar(side,lod),node_name=name,geom_name=name,transform=translation_matrix([side*.76,.91,-.02]))
    return sc

def pad4(b):return b+(b'\x00'*((-len(b))%4))

def patch_animations(input_path, model):
    # Append standard glTF animation samplers to the GLB, not custom runtime-only metadata.
    # Convert animated node matrices to TRS (glTF forbids animation targeting matrix nodes).
    original=input_path.read_bytes()
    if original[0:4]!=b'glTF':raise ValueError('No GLB')
    off=12; chunks=[]
    while off<len(original):
        n,t=struct.unpack_from('<II',original,off);off+=8;chunks.append((t,original[off:off+n]));off+=n
    gltf=json.loads(chunks[0][1].rstrip(b'\x20\x00').decode('utf-8'))
    bin_data=bytearray(chunks[1][1])
    node_map={node.get('name',''):i for i,node in enumerate(gltf['nodes'])}
    animated=['SailCloth','SailRolled','SailRigPivot','RudderPivot'] if model=='sailboat_small' else ['OarPort','OarStarboard']
    for key in animated:
        if key not in node_map:raise RuntimeError(f'Missing node {key}, got {list(node_map)}')
        node=gltf['nodes'][node_map[key]]
        # trimesh exports matrix for transforms; extract simple translation and scale.
        if 'matrix' in node:
            mat=np.array(node.pop('matrix'),dtype=float).reshape((4,4),order='F')
            trans=mat[:3,3]
            scale=np.linalg.norm(mat[:3,:3],axis=0)
            node['translation']=[float(v) for v in trans]
            node['rotation']=[0,0,0,1]
            node['scale']=[float(v) for v in scale]
        else:
            node.setdefault('translation',[0,0,0]);node.setdefault('rotation',[0,0,0,1]);node.setdefault('scale',[1,1,1])
    animations=[]
    def acc(values,gltype):
        v=np.asarray(values,dtype=np.float32)
        while len(bin_data)%4:bin_data.append(0)
        ofs=len(bin_data);bin_data.extend(v.tobytes())
        gltf.setdefault('bufferViews',[]).append({'buffer':0,'byteOffset':ofs,'byteLength':v.nbytes})
        idx=len(gltf['bufferViews'])-1
        count=len(v) if v.ndim>1 else len(v)
        gltf.setdefault('accessors',[]).append({'bufferView':idx,'componentType':5126,'count':count,'type':gltype,'min':np.min(v,axis=0).reshape(-1).tolist(),'max':np.max(v,axis=0).reshape(-1).tolist()})
        return len(gltf['accessors'])-1
    def clip(name,times,channels):
        # channels list (node, path, np.float32 vectors)
        tacc=acc(times,'SCALAR');samps=[];ch=[]
        for node,path,values in channels:
            outacc=acc(values,{'translation':'VEC3','rotation':'VEC4','scale':'VEC3'}[path]);idx=len(samps)
            samps.append({'input':tacc,'output':outacc,'interpolation':'LINEAR'})
            ch.append({'sampler':idx,'target':{'node':node_map[node],'path':path}})
        animations.append({'name':name,'samplers':samps,'channels':ch})
    def qrot(axis,angle):
        a=np.asarray(axis,float);s=math.sin(angle/2)
        return [float(a[0]*s),float(a[1]*s),float(a[2]*s),float(math.cos(angle/2))]
    if model=='sailboat_small':
        tim=[0.,.55,1.2]
        clip('SailFold',tim,[
            ('SailCloth','scale',[[1,1,1],[1,.47,1],[1,.025,1]]),
            ('SailRolled','scale',[[.002,.002,.002],[.45,.45,.45],[1,1,1]])
        ])
        clip('SailUnfold',tim,[
            ('SailCloth','scale',[[1,.025,1],[1,.47,1],[1,1,1]]),
            ('SailRolled','scale',[[1,1,1],[.45,.45,.45],[.002,.002,.002]])
        ])
        clip('SailTrim', [0.,1.5,3.], [('SailRigPivot','rotation', [qrot([0,1,0],-0.25),qrot([0,1,0],0.24),qrot([0,1,0],-0.25)])])
        clip('RudderTurn',[0.,.8,1.6],[('RudderPivot','rotation',[qrot([0,1,0],-.4),qrot([0,1,0],.4),qrot([0,1,0],-.4)])])
    else:
        times=[0.,.25,.62,1.,1.32,1.60]
        port=[qrot([0,1,0],a) for a in [0.,-.35,-.18,.35,.22,0.]]
        star=[qrot([0,1,0],-a) for a in [0.,-.35,-.18,.35,.22,0.]]
        clip('OarsRow',times,[('OarPort','rotation',port),('OarStarboard','rotation',star)])
    gltf['animations']=animations
    gltf['buffers'][0]['byteLength']=len(bin_data)
    json_bytes=pad4(json.dumps(gltf,separators=(',',':')).encode('utf8')).replace(b'\x00',b' ')
    bin_bytes=pad4(bytes(bin_data))
    header=struct.pack('<4sII',b'glTF',2,12+8+len(json_bytes)+8+len(bin_bytes))
    out=header+struct.pack('<II',len(json_bytes),0x4E4F534A)+json_bytes+struct.pack('<II',len(bin_bytes),0x004E4942)+bin_bytes
    input_path.write_bytes(out)
    return list(node_map.keys()), [a['name'] for a in animations]

def export(s,folder,model,lod=0):
    # Repair face winding / normals before export to avoid view-dependent holes.
    for geom in s.geometry.values():
        try:
            geom.remove_unreferenced_vertices()
            trimesh.repair.fix_winding(geom)
            trimesh.repair.fix_normals(geom, multibody=False)
        except Exception:
            pass
    path=ROOT/'public'/'models'/'boats'/folder/f'lod{lod}.glb'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(s.export(file_type='glb'))
    nodes,clips=patch_animations(path,model)
    return path,nodes,clips

if __name__=='__main__':
    results={}
    for key,fn in [('rowboat_wood',make_rowboat),('sailboat_small',make_sailboat)]:
        results[key]={}
        for lod in (0,1):
            path,nodes,clips=export(fn(lod),key,key,lod)
            sc=trimesh.load(path,force='scene')
            tris=sum(len(g.faces) for g in sc.geometry.values())
            results[key][str(lod)]={'path':str(path),'triangles':tris,'nodes':nodes,'animations':clips,'bytes':path.stat().st_size}
    print(json.dumps(results,indent=2))
