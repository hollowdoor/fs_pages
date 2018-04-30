export class AbstractWorker {
    constructor(){
        this.queue = [];
        this.running = false;
        this.pending = Promise.resolve();
    }
    addTask(cb){
        this.queue.push(cb);
    }
    runTasks(){
        if(this.running){
            return this.pending;
        }

        const run = ()=>{

            if(!this.queue.length){
                if(this.running){
                    return this.pending;
                }
                return Promise.resolve();
            }

            let job = this.queue.shift();

            this.running = this.queue.length;

            this.running = true;
            this.pending = Promise
            .resolve(job())
            .then(()=>{
                this.running = !!this.queue.length;
                run();
            });

            return this.pending;

        };

        return run();
    }
}
