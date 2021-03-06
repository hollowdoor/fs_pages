import {Pages} from '../';
import test from 'ava';

test.after('delete', async t=>{

    let pages = new Pages('./test');

    await pages.load(['./store1/*.md']);

    t.is(pages.length, 3);

    await pages.delete('./store1');

    await pages.load(['./store1/*.md']);

    t.is(pages.length, 0);
});

test('load', async t=>{
    let pages = new Pages('./test');
    //console.log('pages ', pages);
    let p = await pages.load('./stuff/*.md');
    t.is(p.pages[0].content, '1\n');
});


test('output', async t=>{
    let pages = new Pages('./test', {
        afterOutput(pages){
            return pages.load();
        }
    });
    await pages.load(['./stuff/*.md']);
    let p = await pages.output('./test/store1');
    t.is(p.pages[0].content, '1\n');
});


/*
pages1.load().then(pages=>{
    pages.forEach(page=>{
        console.log(page.content);
    });
    console.log('pages ', pages);
    for(let page of pages){
        console.log('page ',page);
    }
});

pages1.load();
pages1.output('store1').then((pages)=>{
    console.log(pages);
    console.log('done');
    return new Pages({pages});
}).then(pages=>{
    console.log(pages.pages);
    setTimeout(()=>{
        for(let page of pages){
            //console.log(page);
            page.delete();
        }
    }, 4000);

}).catch(e=>{
    console.error(e);
});*/
