"""Render a local test arrangement; no third-party sound recording or samples."""
from pathlib import Path
import array,math,wave
ROOT=Path(__file__).resolve().parents[1]
RATE=22050;BEAT=.48
# Beethoven's Ode to Joy melody; a simple synthesized mallet/piano test arrangement.
lines=['E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4:2',
       'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4:2',
       'D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3:2',
       'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4:2']
notes=[];position=0
for token in ' '.join(lines).split():
 name,_,length=token.partition(':');beats=float(length or 1);notes.append((name,position,beats));position+=beats
size=int((position*BEAT+2)*RATE);mix=[0.0]*size
semitones={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def tone(name,start,duration,volume):
 midi=12*(int(name[-1])+1)+semitones[name[0]];freq=440*2**((midi-69)/12);count=int(min(duration+1.0,3.5)*RATE);offset=int(start*RATE)
 for sample in range(min(count,size-offset)):
  t=sample/RATE;attack=min(1,t/.012);release=min(1,max(0,(duration+1-t)/.3));value=0
  for harmonic,gain in [(1,1),(2,.28),(3,.10),(4,.045)]:value+=gain*math.sin(2*math.pi*freq*harmonic*t)*math.exp(-t*(2.0+harmonic*.7))
  mix[offset+sample]+=value*attack*release*volume
for name,start,beats in notes:tone(name,start*BEAT,beats*BEAT,.33)
chords=[('C3','E3','G3'),('G2','B2','D3'),('A2','C3','E3'),('F2','A2','C3')]
for beat in range(0,int(position),4):
 for index,name in enumerate(chords[(beat//4)%4]):tone(name,(beat+index*.5)*BEAT,BEAT*2,.10)
peak=max(abs(value) for value in mix) or 1
data=array.array('h',(int(max(-1,min(1,value/peak*.74))*32767) for value in mix))
target=ROOT/'assets/music/ode-to-joy-test.wav';target.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(target),'wb') as output:output.setparams((1,2,RATE,0,'NONE','not compressed'));output.writeframes(data.tobytes())
print(f'{target.name}: {len(data)/RATE:.1f}s, {target.stat().st_size} bytes')
