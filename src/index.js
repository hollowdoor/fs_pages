import fs from 'fs';
import Promise from 'bluebird';
import path from 'path';
import mime from 'mime-types';
import globby from 'globby';
import makeDir from 'make-dir';
import del from 'del';
const p = Promise.promisify;
const readdir = p(fs.readdir);
const readFile = p(fs.readFile);
const writeFile = p(fs.writeFile);
const unlink = p(fs.unlink);
const stat = p(fs.stat);
const cwd = process.cwd();

export class Page {
    constructor(filepath, {
        load = (s)=>s,
        output = (c)=>c
    } = {}){
        this.filepath = filepath;
        this.mimetype = mime.lookup(filepath);
        this.filename = path.basename(filepath);
        this.dirname = path.dirname(filepath);
        this.pending = Promise.resolve(this);

        this._load = load;
        this._output = output;
    }
    load(){
        this.pending = stat(this.filepath)
        .then(stats=>{
            this.stats = stats;
            return readFile(this.filepath, 'utf8');
        }).then(source=>{
            this.source = source;
            this.content = this._load(source);
            return this;
        });
        return this.pending;
    }
    streamTo(filename, {toPromise = true} = {}){
        let rs = fs.createReadStream(this.filename);
        let ws = fs.createWriteStream(filename);
        let pipe = rs.pipe(ws);
        if(!toPromise) return pipe;
        return new Promise((resolve, reject)=>{
            rs.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', resolve);
        });
    }
    output(filename, {
        autoTransfer = true,
        load,
        output
    } = {}){

        if(autoTransfer && /^image|^video/.test(this.mimetype)){
            return this.streamTo(filename);
        }

        let dirname = path.dirname(filename);
        let making = makeDir(dirname);

        return Promise.all([
            this.pending,
            making
        ])
        .then(p=>{
            this.content = this._output(this.content);

            return writeFile(
                filename,
                this.content
            ).then(v=>{
                return new Page(filename, {
                    load,
                    output
                }).load();
            });
        });
    }
    toDirectory(dir, {
        load, output, autoTransfer
    } = {}){
        return this.output(
            path.join(dir, this.filename),
            {load, output, autoTransfer}
        );
    }
    delete({parent = false} = {}){
        let p = parent
        ? del([this.dirname])
        : Promise.resolve();

        return p.then(()=>{
            return del([this.filepath])
            .catch(e=>{
                return Promise.resolve([this.filepath]);
            });
        });
    }
}


export class Pages {
    constructor({
        globs = null,
        pages = [],
        cwd = process.cwd(),
        load = (s)=>s,
        output = (c)=>c,
        loadAll = (p)=>p,
        beforeOutput = (p)=>p,
        afterOutput = (p)=>p
    } = {}){
        this.cwd = cwd;
        this.pages = pages;

        this.globs = globs;
        this.pending = Promise.resolve(this.pages);
        this._load = load;
        this._output = output;
        this._loadAll = loadAll;
        this._afterOutput = afterOutput;
    }
    get length(){
        return this.pages.length;
    }
    load({
        globOptions = {}
    } = {}){

        globOptions.cwd = globOptions.cwd || this.cwd;

        this.pending = globby(this.globs, globOptions)
        .then(files=>{

            return Promise.all(files
            .map((file, i)=>{
                let filepath = path.join(
                    this.cwd,
                    file
                );

                return new Page(filepath, {
                    load:this._load,
                    output:this._output
                }).load();
            }));
        }).then(pages=>{
            this.pages = this._loadAll(pages);
            return this.pages;
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
            //this.pages = this._outputAll(pages);
            let writing = this.pages.map(page=>{
                return page.toDirectory(dir, {autoTransfer, load, output});
            });

            return Promise.all(writing)
            .then(pages=>{
                return this._afterOutput(pages);
            });
        });
    }
    delete(options){
        let del = this.pages.map(page=>{
            return page.delete(options);
        });
        return Promise.all(del);
    }
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
