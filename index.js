'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var Promise$1 = _interopDefault(require('bluebird'));
var path = _interopDefault(require('path'));
var mime = _interopDefault(require('mime-types'));
var globby = _interopDefault(require('globby'));
var makeDir = _interopDefault(require('make-dir'));
var del = _interopDefault(require('del'));
var copy = _interopDefault(require('copy-concurrently'));
var move = _interopDefault(require('move-concurrently'));
require('tempy');
var os = _interopDefault(require('os'));
var EventEmitter = _interopDefault(require('events'));

const p = Promise$1.promisify;
const readdir = p(fs.readdir);
const readFile = p(fs.readFile);
const writeFile = p(fs.writeFile);
const unlink = p(fs.unlink);
const stat = p(fs.stat);
const cwd = process.cwd();
const concurrent = os.cpus() || 1;

class FileOrg extends EventEmitter {
    constructor(pathname){
        super();
        this.pathname = pathname;
        this.dirname = path.dirname(pathname);
        this.name = path.basename(pathname);
        this.__resultClass = this.constructor;
    }
    stat(){
        return stat(this.pathname);
    }
    copy(destination, options = {}){
        return copy(this.pathname, destination, {
            maxConcurrency: concurrent
        }).then(()=>{
            let C = this.__resultClass;
            let i = new C(destination, options);
            this.emit('copied', i);
            return i;
        });
    }
    move(destination, options = {}){
        return move(this.pathname, destination, {
            maxConcurrency: concurrent
        }).then(()=>{
            let C = this.__resultClass;
            let i = new C(destination, options);
            this.emit('moved', i);
            return i;
        });
    }
}

class File extends FileOrg {
    constructor(pathname){
        super(pathname);
        this.mimetype = mime.lookup(pathname);
    }
    read(options = 'utf8'){
        return readFile(this.pathname, options)
        .then(content=>{
            this.emit('read', content);
            return content;
        });
    }
    write(content, options){
        return makeDir(this.dirname)
        .then(()=>{
            return writeFile(
                this.pathname, content, options
            );
        })
        .then(content=>{
            this.emit('written', content);
            return content;
        });
    }
    readStream(){
        let s = fs.createReadStream(this.pathname);
        this.emit('read-stream', s);
        return this;
    }
    writeStream(){
        makeDir.sync(this.dirname);
        let s = fs.createWriteStream(this.pathname);
        this.emit('write-stream', s);
        return this;
    }
    delete(options){
        return del([this.pathname])
        .then(res=>{
            this.emit('delete', res);
            return res;
        });
    }
}

class Directory extends FileOrg {
    constructor(pathname = process.cwd()){
        super(pathname);
    }
    glob(globs, options = {}){
        options.cwd = this.pathname;
        return globby(globs, options)
        .then(dirs=>{
            this.emit('globbed', dirs);
            return dirs;
        });
    }
    read(options){
        return readdir(this.pathname, options)
        .then(files=>{
            this.emit('read', files);
            return files;
        });
    }
    readStream(){
        //https://github.com/nodejs/node/issues/583
        let dirs = this.read();
        let index = -1;
        let s = new Readable({
            read(){
                if(++index < dirs.length){
                    this.push(dirs[index]);
                }else{
                    this.push(null);
                }
            }
        });

        this.emit('read-stream', s);
        return s;
    }
    delete(files = null, options = {}){

        if(files === null){
            return del([this.pathname], options)
            .then(res=>{
                this.emit('deleted', res);
            });
        }

        if(typeof files === 'string'){
            files = [files];
        }

        if(Array.isArray(files)){
            files = files.map(file=>{
                return path.join(this.pathname, file);
            });
        }


        //console.log('files ',files)

        return del(files, options)
        .then(res=>{
            this.emit('deleted', res);
            return res;
        });
    }
}

class Page extends File {
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

class Pages extends Directory {
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
                });

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
