import path from 'path';
import { File, Directory } from './lib/fs_class.js';

export class Page extends File {
    constructor(pathname, {
        load = (s)=>s,
        output = (c)=>c,
        streamMedia = true
    } = {}){
        super(pathname);
        this.streamMedia = streamMedia;
        this.loading = Promise.resolve();
        this._load = load;
        this._output = output;
    }
    copy(filename, options){
        return super.copy(filename)
        .then(()=>{
            return new Page(filename, options);
        });
    }
    load(){
        if(this.streamMedia && /^image|^video/.test(this.mimetype)){
            return Promise.resolve(this);
        }

        this.loading = Promise.all([
            this.stat(),
            this.read()
        ]).then(([stats, content])=>{
            this.stats = stats;
            return (this.content = this._load(content));
        });
        return this.loading;
    }
    output(filename, {
        streamMedia,
        load,
        output
    } = {}){

        streamMedia = streamMedia !== void 0
        ? !!streamMedia
        : this.streamMedia;

        return this.loading.then(p=>{
            if(this.streamMedia && /^image|^video/.test(this.mimetype)){
                return this.copy(filename, {
                    streamMedia,
                    load,
                    output
                });
            }

            let page = new Page(filename, {
                streamMedia,
                load,
                output
            });

            let content = this._output(this.content);

            return page.write(content)
            .then(()=>{
                this.emit('after-output', page);
                return page;
            });
        });
    }
    toDirectory(dir, {
        load, output, autoTransfer
    } = {}){
        return this.output(
            path.join(dir, this.name),
            {load, output, autoTransfer}
        );
    }
}

export class Pages extends Directory {
    constructor(dir, {
        pages = [],
        load = (s)=>s,
        output = (c)=>c,
        loadAll = (p)=>p,
        beforeOutput = (p)=>p,
        afterOutput = (p)=>p
    } = {}){
        super(dir);
        this.pages = pages;
        this.pending = Promise.resolve(this.pages);
        this._load = load;
        this._output = output;
        this._loadAll = loadAll;
        this._afterOutput = afterOutput;
    }
    get length(){
        return this.pages.length;
    }
    load(globs, options = {}){

        let loading;

        options.cwd = this.pathname;

        if(globs === void 0){
            loading = this.read();
        }else{
            loading = this.glob(globs, options);
        }

        this.pending = loading
        .then(files=>{

            return Promise.all(files
            .map((file, i)=>{
                let filepath = path.join(
                    this.pathname,
                    file
                );

                let page = new Page(filepath, {
                    load:this._load,
                    output:this._output
                })

                return page.load().then(()=>page);
            }));
        }).then(pages=>{
            this.pages = this._loadAll(pages);
            return this;
        });

        return this.pending;
    }
    output(dir, {
        autoTransfer = true,
        load,
        output
    } = {}){

        if(typeof dir !== 'string'){
            throw new TypeError(`${dir} should be a string to output files to`);
        }

        return this.pending.then(pages=>{
            let writing = this.pages.map(page=>{
                return page.toDirectory(dir, {autoTransfer, load, output});
            });

            return Promise.all(writing)
            .then(pages=>{
                return this._afterOutput(new Pages(dir));
            });
        });
    }
    /*delete(files, options){
        return super.delete(files, options)
        .then((deleted)=>{
            console.log('deleted ',deleted)
            let pages = [];
            for(let i=0; i<deleted.length; i++){
                if(deleted)
            }
        });
    }*/
    [Symbol.iterator](){
        let i = -1;
        let pages = this.pages;
        return {
            next(){
                if(++i > pages.length - 1){
                    return {done: true};
                }
                return {
                    value: pages[i],
                    done: false
                };
            }
        };
    }
}



export class Pager {
    constructor({
        pages = [],
        wrap = true,
        load = (p)=>p,
        turn = (p)=>p
    } = {}){
        this.pages = pages;
        this.index = 0;
        this._turn = turn;
    }
    load(o){
        let loading = this.pages.map(p=>{
            return p.load(o).then(()=>{
                return this._load(p);
            });
        });

        return Promise.all(loading);
    }
    change(index){
        if(index > this.index){
            if(index > this.pages.length - 1){
                if(this.wrap){ this.index = 0; }
            }else{
                ++this.index;
            }
        }else if(index < this.index){
            if(index < 0){
                if(this.wrap){
                    this.index = this.pages.length - 1;
                }
            }else{
                --this.index;
            }
        }
        return (this.current = this.pages[this.index]);
    }
    turn(index){
        let i = this.index;
        if(index === '>'){
            ++i;
        }else if(index === '<'){
            --i;
        }else{
            i = index;
        }

        return this._turn(this.change(i));
    }
}
