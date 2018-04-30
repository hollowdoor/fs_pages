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

export class File extends FileOrg {
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

export class Directory extends FileOrg {
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
