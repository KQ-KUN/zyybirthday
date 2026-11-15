import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptAlbum,decryptAlbum,normalizeName,normalizeBirthday} from '../crypto.js';

test('姓名和月日规范化，并拒绝无效日期',()=>{
  assert.equal(normalizeName(' 测 试 '),'测试');
  assert.equal(normalizeBirthday('5月8日'),'0508');
  assert.equal(normalizeBirthday('05/18'),'0518');
  assert.throws(()=>normalizeBirthday('0230'));
  assert.throws(()=>normalizeBirthday('19900518'));
});
test('正确输入可解密；错误姓名、错误生日均不能读取内容',async()=>{
  const payload={version:1,album:{places:[{name:'隐私测试地点'}]},images:{example:'private-image-data'}};
  const encrypted=await encryptAlbum(payload,'测试昵称','0518');
  assert(!JSON.stringify(encrypted).includes('隐私测试地点'));
  assert(!JSON.stringify(encrypted).includes('测试昵称'));
  assert.deepEqual(await decryptAlbum(encrypted,'测试昵称','05月18日'),payload);
  await assert.rejects(()=>decryptAlbum(encrypted,'别的昵称','0518'));
  await assert.rejects(()=>decryptAlbum(encrypted,'测试昵称','0519'));
});
test('同样内容每次生成不同密文；篡改密文后校验失败',async()=>{
  const a=await encryptAlbum({value:'test'},'测试昵称','0518');
  const b=await encryptAlbum({value:'test'},'测试昵称','0518');
  assert.notEqual(a.salt,b.salt);
  assert.notEqual(a.iv,b.iv);
  assert.notEqual(a.ciphertext,b.ciphertext);
  const bytes=Buffer.from(a.ciphertext,'base64');bytes[0]^=1;
  await assert.rejects(()=>decryptAlbum({...a,ciphertext:bytes.toString('base64')},'测试昵称','0518'));
  await assert.rejects(()=>decryptAlbum({...a,iterations:1},'测试昵称','0518'));
});
