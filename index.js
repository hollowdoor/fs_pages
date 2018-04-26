'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var Promise = _interopDefault(require('bluebird'));
var path = _interopDefault(require('path'));
var mime = _interopDefault(require('mime-types'));
var globby = _interopDefault(require('globby'));
var makeDir = _interopDefault(require('make-dir'));
var del = _interopDefault(require('del'));

const p = Promise.promisify;
const readdir = p(fs.readdir);
const readFile = p(fs.readFile);
const writeFile = p(fs.writeFile);
const unlink = p(fs.unlink);
const stat = p(fs.stat);
const cwd = process.cwd();

class Page {
    constructor(filepath, {
        load = (s)=>s,
        output = (c)=>c,
        streamMedia = true
    } = {}){
        this.filepath = filepath;
        this.mimetype = mime.lookup(filepath);
        this.filename = path.basename(filepath);
        this.dirname = path.dirname(filepath);
        this.pending = Promise.resolve(this);

        this.streamMedia = streamMedia;
        this._load = load;
        this._output = output;
    }
    write(content = ''){
        return makeDir(this.dirname)
        .then(()=>{
            return writeFile(
                this.filepath,
                content
            ).then(()=>{
                return this.content = content;
            });
        });
    }
    stream(){
        return fs.createReadStream(this.filename);
    }
    load(){
        this.pending = stat(this.filepath)
        .then(stats=>{
            this.stats = stats;
            return readFile(this.filepath, 'utf8');
        }).then(content=>{
            this.content = this._load(content);
            return this;
        });
        return this.pending;
    }
    streamTo(filename, {toPromise = true} = {}){
        let rs = this.stream();
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
        load,
        output
    } = {}){

        return this.pending.then(p=>{
            let page = new Page(filename, {
                load,
                output,
                streamMedia: this.streamMedia
            });

            if(this.streamMedia && /^image|^video/.test(this.mimetype)){
                return this.streamTo(filename)
                .then(p=>page);
            }

            let content = this._output(this.content);

            return page.write(content)
            .then(()=>page);
        });

        /*let dirname = path.dirname(filename);
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
        });*/
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


class Pages {
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
        let del$$1 = this.pages.map(page=>{
            return page.delete(options);
        });
        return Promise.all(del$$1);
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

class Pager {
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

exports.Page = Page;
exports.Pages = Pages;
exports.Pager = Pager;
