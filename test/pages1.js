import {Pages} from '../';
import test from 'ava';

test.after('delete', async t=>{

    let pages = new Pages({
        globs:'./test/store1/*'
    });

    await pages.load();

    t.is(pages.length, 3);

    await pages.delete();

    await pages.load();

    t.is(pages.length, 0);
});

test('load', async t=>{
    let pages = new Pages({globs:'./test/stuff/*'});
    //console.log('pages ', pages);
    let p = await pages.load();
    t.is(p[0].content, '1\n');
});


test('output', async t=>{
    let pages = new Pages({
        globs:'./test/stuff/*',
        afterOutput(pages){
            //console.log(pages)
            return new Pages({pages});
        }
    });
    await pages.load();
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
