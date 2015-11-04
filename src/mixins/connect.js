export default function getConnectMixin (store) {
  let listener;

  return {
    getInitialState: function () {
      const frozen = store.store.get(arguments);
      const state = frozen[store.path].toJS();

      let changeCallback = function (state) {
        this.setState(state[store.path].toJS());
      };

      if (!this.boundEximChangeCallbacks)
        this.boundEximChangeCallbacks = {};

      this.boundEximChangeCallbacks[store.path] = changeCallback.bind(this);

      listener = frozen.getListener();
      return state;
    },

    componentDidMount: function () {
      listener.on('update', this.boundEximChangeCallbacks[store.path]);
    },

    componentWillUnmount: function () {
      if (listener)
        listener.off('update', this.boundEximChangeCallbacks[store.path]);
    }
  };
}
