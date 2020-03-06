exports.Coder = function(pre, post, tabLevel) {

    this._pre = pre;
    this._post = post;
    this._tabLevel = tabLevel;
    this._blocks = [];

};

exports.Coder.prototype.addBlock = function(pre, post, increaseTabLevel = true) {

    let block = new exports.Coder(pre, post, this._tabLevel + (increaseTabLevel ? 1 : 0));
    this._blocks.push(block);

    return block;

};

exports.Coder.prototype.addLine = function(line) {

    this._blocks.push(line);
    return this;

};

exports.Coder.prototype.generateCode = function(tabs) {

    // create code
    let code = tabs + this._pre + "\n";

    // sub blocks
    for(let i = 0; i < this._blocks.length; ++i) {

        // get block
        let block = this._blocks[i];

        let t = "    ".repeat(this._tabLevel);
        if(block instanceof exports.Coder)
            code += block.generateCode(t);
        else
            code += t + block + "\n";

    }

    code += tabs + this._post + "\n\n";
    return code;

};