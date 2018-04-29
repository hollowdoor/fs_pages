import fs from 'fs';
import Promise from 'bluebird';
import path from 'path';
import mime from 'mime-types';
import globby from 'globby';
import makeDir from 'make-dir';
import del from 'del';
import copy from 'copy-concurrently';
import move from 'move-concurrently';
import tempy from 'tempy';
import os from 'os';
import EventEmitter from 'events';
const p = Promise.promisify;
const readdir = p(fs.readdir);
const readFile = p(fs.readFile);
const writeFile = p(fs.writeFile);
const unlink = p(fs.unlink);
const stat = p(fs.stat);
const cwd = process.cwd();
const concurrent = os.cpus() || 1;

class FileOrg extends EventEmitter {
    constructor(pathname){
        this.pathname = pathname;
        this.dirname = path.dirname(pathname);
        this.name = path.basename(pathname);
        this.__resultClass = this.constructor;
    }
    delete({parent = false} = {}){
        return p.then(()=>{
            return del([this.pathname])
            .catch(e=>{
                return Promise.resolve([this.pathname]);
            });
        }).then(()=>{
            return parent
            ? del([this.dirname])
            : this.dirname;
        }).then(res=>{
            this.emit('delete');
            return res;
        });
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
            this.emit('copy', i);
            return i;
        });
    }
    move(destination, options = {}){
        return move(this.pathname, destination, {
            maxConcurrency: concurrent
        }).then(()=>{
            let C = this.__resultClass;
            let i = new C(destination, options);
            this.emit('move', i);
            return i;
        });
    }
}

export class File extends FileOrg {
    constructor(pathname){
        super(pathname);
        this.mimetype = mime.lookup(pathname);
    }
    read(options, options = 'utf8'){
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
            this.emit('write', content);
            return content;
        });
    }
    readStream(){
        return fs.createReadStream(this.pathname);
    }
    writeStream(){
        makeDir.sync(this.dirname);
        return fs.createWriteStream(this.pathname);
    }
}

export class Directory extends FileOrg {
    constructor(pathname = process.cwd()){
        super(pathname);
    }
    glob(globs, options = {}){
        options.cwd = this.pathname;
        return globby(globs, options)
        .then(dirs=>{
            this.emit('glob', dirs);
            return dirs;
        });
    }
    read(){
        return readdir(this.pathname)
        .then(dirs=>{
            this.emit('read', dirs);
            return dirs;
        });
    }
    readStream(){
        //https://github.com/nodejs/node/issues/583
        let dirs = this.read();
        let index = -1;
        return new Readable({
            read(){
                if(++index < dirs.length){
                    this.push(dirs[index]);
                }else{
                    this.push(null);
                }
            }
        });
    }
}

export class TempFile extends File {
    constructor(options){
        super(tempy.file(options));
    }
}

export class TempDirectory extends Directory {
    constructor(){
        super(tempy.directory());
    }
}
