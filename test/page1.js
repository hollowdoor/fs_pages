import {Page} from '../';
import test from 'ava';

test('load', async t=>{
    let page = new Page('./test/stuff/file1.md');
    await page.load();
    t.is(page.content, '1\n');
});
