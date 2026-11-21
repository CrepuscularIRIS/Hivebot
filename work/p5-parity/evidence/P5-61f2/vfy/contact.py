from pathlib import Path
from PIL import Image,ImageDraw
import io,subprocess
E=Path(__file__).parent
for mode in ['dark','light']:
 frames=[]
 for t in [.55,.65,.75,.85,.95,1.05]:
  raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i',str(E/'run-0'/f'reload-{mode}.mkv'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
  image=Image.open(io.BytesIO(raw)).convert('RGB')
  strip=Image.new('RGB',(1280,180),'#888888'); strip.paste(image.crop((0,0,1280,60)),(0,20)); strip.paste(image.crop((0,720,1280,820)),(0,80))
  ImageDraw.Draw(strip).text((8,3),f'{mode} reload movie t={t:.2f}s; top 60px + bottom 100px (application window only)',fill='white')
  frames.append(strip)
 sheet=Image.new('RGB',(1280,len(frames)*180));
 for i,image in enumerate(frames):sheet.paste(image,(0,i*180))
 sheet.save(E/f'contact-{mode}.png')
